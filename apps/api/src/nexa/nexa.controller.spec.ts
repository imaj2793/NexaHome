import { ServiceUnavailableException } from '@nestjs/common';
import { NexaController } from './nexa.controller';
import type { NexaService } from './nexa.service';
import type { SttService } from './stt.service';

/**
 * Controller diuji tanpa Nest DI agar fokus pada pemetaan error ke status HTTP
 * yang tepat — hal yang menentukan apakah UI bisa menerapkan fallback atau tidak.
 */
describe('NexaController', () => {
  let nexa: {
    capabilities: ReturnType<typeof vi.fn>;
    chat: ReturnType<typeof vi.fn>;
    synthesize: ReturnType<typeof vi.fn>;
  };
  let stt: {
    isConfigured: ReturnType<typeof vi.fn>;
    transcribe: ReturnType<typeof vi.fn>;
  };
  let controller: NexaController;

  beforeEach(() => {
    nexa = {
      capabilities: vi.fn().mockReturnValue({
        aiProvider: 'mock',
        llm: 'mock',
        tts: 'mock',
        stt: { configured: false, engine: 'whisper.cpp' },
        degraded: true,
      }),
      chat: vi.fn().mockResolvedValue({ message: 'hai', state: 'SUCCESS' }),
      synthesize: vi.fn().mockResolvedValue(Buffer.from('mp3')),
    };
    stt = {
      isConfigured: vi.fn().mockReturnValue(true),
      transcribe: vi.fn().mockResolvedValue('nyalakan lampu kamar'),
    };
    controller = new NexaController(nexa as unknown as NexaService, stt as unknown as SttService);
  });

  describe('status', () => {
    it('mengembalikan kemampuan berdasarkan konfigurasi STT', () => {
      stt.isConfigured.mockReturnValue(false);

      expect(controller.status()).toMatchObject({
        aiProvider: 'mock',
        degraded: true,
        stt: { configured: false },
      });
      expect(nexa.capabilities).toHaveBeenCalledWith(false);
    });
  });

  describe('transcribe', () => {
    const dto = { audio: Buffer.from('audio').toString('base64') };

    it('mengembalikan teks hasil transkripsi saat STT siap', async () => {
      await expect(controller.transcribe(dto)).resolves.toEqual({
        text: 'nyalakan lampu kamar',
      });
      expect(stt.transcribe).toHaveBeenCalledWith(Buffer.from('audio'));
    });

    it('503 dengan pesan ramah saat STT belum dikonfigurasi', async () => {
      stt.isConfigured.mockReturnValue(false);

      const error = await controller.transcribe(dto).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).message).toMatch(
        /WHISPER_MODEL/,
      );
      // Tidak memanggil whisper sama sekali — hemat sumber daya.
      expect(stt.transcribe).not.toHaveBeenCalled();
    });

    it('503 dengan saran fallback saat transkripsi gagal', async () => {
      stt.transcribe.mockRejectedValue(new Error('whisper exit code 1'));

      const error = await controller.transcribe(dto).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).message).toMatch(
        /ketik perintahmu/i,
      );
      // Detail internal tidak bocor ke client.
      expect((error as ServiceUnavailableException).message).not.toContain(
        'exit code 1',
      );
    });
  });

  describe('speech', () => {
    it('503 saat TTS gagal agar client jatuh ke speechSynthesis browser', async () => {
      nexa.synthesize.mockRejectedValue('tts provider down');

      const error = await controller
        .speech({ text: 'halo' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    });
  });
});
