import type { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import type { Mock } from 'vitest';
import { SttService } from './stt.service';

type ExecCallback = (
  err: Error | null,
  stdout?: string,
  stderr?: string,
) => void;

// `ReturnType<typeof vi.fn>` menghasilkan `Mock<Procedure | Constructable>`
// yang tidak punya call signature; `Mock` (default `Procedure`) menjaga mock
// tetap bisa dipanggil biasa.
type MockExecFile = Mock & {
  [key: symbol]: unknown;
};

/**
 * Mock `execFile` yang meniru perilaku Node: crucially, fungsi asli mengekspos
 * `util.promisify.custom` sehingga `promisify(execFile)` resolve ke
 * `{ stdout, stderr }`. Tanpa simbol itu, hasil promisify berbentuk lain dan
 * service akan selalu gagal membaca `stdout`.
 */
vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');

  const execFile = vi.fn() as unknown as MockExecFile;
  execFile[promisify.custom] = (
    file: string,
    args: string[],
    options?: unknown,
  ) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(file, args, options, ((err: Error | null, stdout = '', stderr = '') => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      }) as ExecCallback);
    });

  return { execFile };
});

const existsSyncMock = vi.fn<(path: string) => boolean>();

vi.mock('fs', () => ({
  existsSync: (path: string) => existsSyncMock(path),
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
}));

/**
 * Bentuk implementasi mock: signature callback Node, dengan `optionsOrCb`
 * bisa berupa options object atau callback langsung. Longgar secara sengaja
 * karena tipe `execFile` asli punya banyak overload.
 */
type ExecImpl = (
  file: string,
  args: string[],
  optionsOrCb?: unknown,
  maybeCb?: unknown,
) => unknown;

type ExecCall = { file: string; args: string[]; options?: unknown };

const execFileMock = execFile as unknown as MockExecFile & {
  mockImplementation(fn: ExecImpl): unknown;
};
const mkdtempMock = vi.mocked(mkdtemp);
const writeFileMock = vi.mocked(writeFile);
const rmMock = vi.mocked(rm);

/** Error dengan bentuk yang dipakai Node saat command exit non-zero. */
function execError(message: string, code = 1): Error & {
  code?: number;
  stdout?: string;
  stderr?: string;
} {
  return Object.assign(new Error(message), { code, stdout: '', stderr: '' });
}

/** Ambil callback dari argumen terakhir implementation mock. */
function takeCallback(optionsOrCb: unknown, maybeCb: unknown): ExecCallback {
  return (typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb) as
    ExecCallback;
}

/**
 * Pasang implementasi `execFile` yang membalas tiap pemanggilan lewat
 * handler; mengembalikan daftar pemanggilan yang tercatat.
 */
function recordExec(
  handler: (call: ExecCall, index: number) => {
    err?: unknown;
    stdout?: string;
  },
): ExecCall[] {
  const calls: ExecCall[] = [];
  execFileMock.mockReset();
  execFileMock.mockImplementation((
    file: string,
    args: string[],
    optionsOrCb?: unknown,
    maybeCb?: unknown,
  ) => {
    const cb = takeCallback(optionsOrCb, maybeCb);
    const call: ExecCall = {
      file,
      args,
      options: typeof optionsOrCb === 'function' ? undefined : optionsOrCb,
    };
    calls.push(call);
    const result = handler(call, calls.length - 1);
    cb((result.err ?? null) as Error | null, result.stdout ?? '', '');
    return undefined;
  });
  return calls;
}

describe('SttService', () => {
  let configValues: Record<string, string | undefined>;
  let config: { get: ReturnType<typeof vi.fn> };
  let service: SttService;

  beforeEach(() => {
    vi.clearAllMocks();
    configValues = {
      WHISPER_BIN: '/opt/whisper/whisper-cli',
      WHISPER_MODEL: '/models/ggml-base.bin',
      WHISPER_LANG: 'id',
    };
    config = { get: vi.fn((key: string) => configValues[key]) };
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
    service = new SttService(config as unknown as ConfigService);

    mkdtempMock.mockReset();
    mkdtempMock.mockResolvedValue('/tmp/nexa-stt-abc');
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    rmMock.mockReset();
    rmMock.mockResolvedValue(undefined);
  });

  describe('transcribe — jalur sukses', () => {
    it('mengubah stdout whisper menjadi teks transkrip', async () => {
      stubExecSuccess('Halo Nexa.\n');

      const text = await service.transcribe(Buffer.from('audio-webm'));

      expect(text).toBe('Halo Nexa.');
      expect(execFileMock).toHaveBeenCalledTimes(2);
    });

    it('membuang baris bertimestamp bertanda kurung siku', async () => {
      stubExecSuccess('[00:00:00.000 --> 00:00:02.000]  Halo Nexa.\n');

      const text = await service.transcribe(Buffer.from('audio-webm'));

      expect(text).toBe('');
    });

    it('memfilter log whisper, timestamp, dan baris kosong', async () => {
      const stdout = [
        'whisper_print_timings: total time = 100.00ms',
        'main: processing file "input.wav"',
        'system_info: n_threads = 4',
        '',
        '  Halo,   nyalakan  lampu kamar  ',
        'log_mel: 100',
        '[00:00.000 --> 00:01.000] second line',
        '   ',
      ].join('\n');
      recordExec((call) => ({
        stdout: call.file === 'ffmpeg' ? '' : stdout,
      }));

      const text = await service.transcribe(Buffer.from('a'));

      // Baris bertimestamp diawali '[' sehingga seluruh baris dibuang, bukan hanya timestamp-nya.
      expect(text).toBe('Halo, nyalakan lampu kamar');
    });

    it('menulis audio ke file sementara lalu membersihkannya setelah selesai', async () => {
      stubExecSuccess('Halo.');

      await service.transcribe(Buffer.from('audio'), { language: 'en' });

      expect(mkdtempMock).toHaveBeenCalledTimes(1);
      expect(writeFileMock).toHaveBeenCalledWith(
        '/tmp/nexa-stt-abc/input.audio',
        Buffer.from('audio'),
      );
      expect(rmMock).toHaveBeenCalledWith('/tmp/nexa-stt-abc', {
        recursive: true,
        force: true,
      });
    });

    it('memakai nilai default WHISPER_BIN dan WHISPER_LANG bila env kosong', async () => {
      configValues.WHISPER_BIN = '   ';
      delete configValues.WHISPER_LANG;
      const calls = stubExecSuccess('Halo.');

      await service.transcribe(Buffer.from('a'));

      const whisper = calls.find((c) => c.file !== 'ffmpeg');
      expect(whisper?.file).toBe('whisper-cli');
      expect(whisper?.args).toContain('-l');
      expect(whisper?.args).toContain('id');
    });

    it('meneruskan opsi bahasa eksplisit menggantikan WHISPER_LANG', async () => {
      const calls = stubExecSuccess('Hello.');

      await service.transcribe(Buffer.from('a'), { language: 'en' });

      const whisper = calls.find((c) => c.file !== 'ffmpeg');
      expect(whisper?.args).toEqual(
        expect.arrayContaining(['-l', 'en']),
      );
    });

    it('menjalankan ffmpeg untuk konversi WAV 16kHz mono', async () => {
      const calls = stubExecSuccess('Halo.');

      await service.transcribe(Buffer.from('a'));

      const ffmpeg = calls.find((c) => c.file === 'ffmpeg');
      expect(ffmpeg?.args).toEqual([
        '-y',
        '-i',
        '/tmp/nexa-stt-abc/input.audio',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        '/tmp/nexa-stt-abc/input.wav',
      ]);
    });

    it('menjalankan whisper dengan model, file WAV, dan maxBuffer yang cukup', async () => {
      const calls = stubExecSuccess('Halo.');

      await service.transcribe(Buffer.from('a'));

      const whisper = calls.find((c) => c.file !== 'ffmpeg');
      expect(whisper?.file).toBe('/opt/whisper/whisper-cli');
      expect(whisper?.args).toEqual([
        '-m',
        '/models/ggml-base.bin',
        '-f',
        '/tmp/nexa-stt-abc/input.wav',
        '-l',
        'id',
        '-otxt',
        '-nt',
      ]);
      expect(whisper?.options).toEqual({ maxBuffer: 16 * 1024 * 1024 });
    });

    it('mengembalikan string kosong bila whisper tidak mengeluarkan teks', async () => {
      stubExecSuccess('');

      await expect(service.transcribe(Buffer.from('a'))).resolves.toBe('');
    });
  });

  describe('isConfigured', () => {
    it('true saat WHISPER_MODEL diisi dan file-nya ada', () => {
      expect(service.isConfigured()).toBe(true);
      expect(existsSyncMock).toHaveBeenCalledWith('/models/ggml-base.bin');
    });

    it('false saat WHISPER_MODEL kosong tanpa menyentuh filesystem', () => {
      delete configValues.WHISPER_MODEL;

      expect(service.isConfigured()).toBe(false);
      expect(existsSyncMock).not.toHaveBeenCalled();
    });

    it('false saat path model tidak ada di disk (mis. container tanpa model)', () => {
      existsSyncMock.mockReturnValue(false);

      expect(service.isConfigured()).toBe(false);
    });

    it('mengecek file model hanya sekali lalu memakai cache', () => {
      expect(service.isConfigured()).toBe(true);
      expect(service.isConfigured()).toBe(true);

      expect(existsSyncMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('transcribe — jalur gagal', () => {
    it('menolak ketika WHISPER_MODEL belum dikonfigurasi', async () => {
      delete configValues.WHISPER_MODEL;

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        /WHISPER_MODEL kosong/,
      );
      expect(mkdtempMock).not.toHaveBeenCalled();
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('menolak ketika WHISPER_MODEL hanya berisi spasi', async () => {
      configValues.WHISPER_MODEL = '   ';

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        /WHISPER_MODEL/,
      );
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('menolak ketika file model hilang di disk', async () => {
      existsSyncMock.mockReturnValue(false);

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        /tidak ditemukan/,
      );
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('melempar error umum ketika ffmpeg gagal (mis. binary tidak ada)', async () => {
      recordExec(() => ({ err: execError('spawn ffmpeg ENOENT', 127) }));

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        'Gagal mentranskripsi audio.',
      );
      expect(rmMock).toHaveBeenCalledWith('/tmp/nexa-stt-abc', {
        recursive: true,
        force: true,
      });
    });

    it('melempar error umum ketika whisper exit non-zero', async () => {
      recordExec((call) =>
        call.file === 'ffmpeg'
          ? { stdout: '' }
          : { err: execError('whisper-cli: model file not found', 1) },
      );

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        'Gagal mentranskripsi audio.',
      );
    });

    it('memastikan direktori sementara dibersihkan meski whisper gagal', async () => {
      recordExec((call) =>
        call.file === 'ffmpeg' ? { stdout: '' } : { err: execError('gagal') },
      );

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow();

      expect(rmMock).toHaveBeenCalledTimes(1);
    });

    it('menyuskikan error dari mkdtemp tanpa memanggil execFile', async () => {
      mkdtempMock.mockRejectedValue(new Error('ENOSPC: tidak ada ruang'));

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow();

      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('menerjemahkan error dari writeFile menjadi kegagalan transkripsi', async () => {
      writeFileMock.mockRejectedValue(new Error('EACCES: tidak bisa menulis'));

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        'Gagal mentranskripsi audio.',
      );
    });

    it('mengembalikan string kosong tanpa melempar error untuk stdout kosong', async () => {
      stubExecSuccess('   \n\n  \n');

      await expect(service.transcribe(Buffer.from('a'))).resolves.toBe('');
    });

    it('menangani whisper yang hanya mengeluarkan log tanpa transkrip', async () => {
      stubExecSuccess(
        'whisper_print_timings: total time = 12.00ms\nmain: done\n',
      );

      await expect(service.transcribe(Buffer.from('a'))).resolves.toBe('');
    });

    it('tidak melempar error yang bocor dari internal service', async () => {
      // Error non-Error pun harus dinormalisasi menjadi pesan yang sama.
      recordExec((call) =>
        call.file === 'ffmpeg' ? { stdout: '' } : { err: 'bukan objek Error' },
      );

      await expect(service.transcribe(Buffer.from('a'))).rejects.toThrow(
        'Gagal mentranskripsi audio.',
      );
    });
  });

  /** Helper: ffmpeg sukses lalu whisper mengembalikan stdout tertentu. */
  function stubExecSuccess(whisperStdout: string) {
    return recordExec((call) => ({
      stdout: call.file === 'ffmpeg' ? '' : whisperStdout,
    }));
  }
});
