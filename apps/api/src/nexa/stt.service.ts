import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Speech-to-text lokal berbasis whisper.cpp (subprocess).
 *
 * Tidak bergantung pada API eksternal — model ggml dijalankan lokal di CPU
 * (cukup untuk i3 Gen 11 / 12GB RAM dengan model `base`/`tiny`). Audio dari
 * browser (WebM/Opus) dikonversi via ffmpeg ke WAV 16kHz mono, lalu diumpankan
 * ke `whisper-cli`. Jalur binary + model dikonfigurasi lewat env:
 *
 *   WHISPER_BIN    — path binary whisper.cpp (default: `whisper-cli`).
 *   WHISPER_MODEL  — path model ggml (wajib; mis. `ggml-base.bin`).
 *   WHISPER_LANG   — bahasa transkripsi (default: `id`).
 */
@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  /** Hasil pemeriksaan model di-cache: path tidak berubah saat runtime. */
  private cachedModel?: string | null;

  constructor(private readonly config: ConfigService) {}

  /**
   * True bila whisper.cpp benar-benar siap dipakai: `WHISPER_MODEL` diisi dan
   * file-nya benar-benar ada di filesystem. Pemeriksaan file mencegah status
   * "siap" yang menyesatkan di container yang hanya membawa path placeholder.
   * Client memakai ini untuk menampilkan mode terbatas, bukan mengirim audio
   * yang pasti ditolak.
   */
  isConfigured(): boolean {
    return this.modelPath() !== null;
  }

  /**
   * Path model yang benar-benar bisa dipakai, atau `null` bila env kosong atau
   * file-nya tidak ada. Dicek satu kali lalu di-cache karena path tidak berubah
   * selama process hidup.
   */
  private modelPath(): string | null {
    if (this.cachedModel === undefined) {
      const model = this.config.get<string>('WHISPER_MODEL')?.trim();
      this.cachedModel = model && existsSync(model) ? model : null;
      if (model && this.cachedModel === null) {
        this.logger.warn(
          `WHISPER_MODEL diisi tapi file tidak ditemukan: ${model} — STT nonaktif.`,
        );
      }
    }
    return this.cachedModel;
  }

  async transcribe(audio: Buffer, opts?: { language?: string }): Promise<string> {
    const bin = this.config.get<string>('WHISPER_BIN')?.trim() || 'whisper-cli';
    const model = this.modelPath();
    const language = opts?.language ?? this.config.get<string>('WHISPER_LANG') ?? 'id';

    if (!model) {
      throw new Error(
        'STT belum siap — WHISPER_MODEL kosong atau file model tidak ditemukan.',
      );
    }

    const dir = await mkdtemp(join(tmpdir(), 'nexa-stt-'));
    const rawPath = join(dir, 'input.audio');
    const wavPath = join(dir, 'input.wav');

    try {
      await writeFile(rawPath, audio);

      // MediaRecorder menghasilkan WebM/Opus; whisper.cpp butuh WAV 16k mono.
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        rawPath,
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        wavPath,
      ]);

      const args = ['-m', model, '-f', wavPath, '-l', language, '-otxt', '-nt'];
      const { stdout } = await execFileAsync(bin, args, {
        maxBuffer: 16 * 1024 * 1024,
      });

      return this.cleanTranscript(stdout);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Transkripsi gagal: ${msg}`);
      throw new Error('Gagal mentranskripsi audio.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Bersihkan stdout whisper.cpp menjadi teks transkrip murni. */
  private cleanTranscript(raw: string): string {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          !line.startsWith('[') &&
          !line.startsWith('main:') &&
          !line.includes('whisper_') &&
          !line.includes('system_info') &&
          !line.includes('log_'),
      );

    return lines.join(' ').replace(/\s+/g, ' ').trim();
  }
}
