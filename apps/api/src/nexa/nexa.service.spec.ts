import type { ConfigService } from '@nestjs/config';
import type { AIChatResponse, ChatMessage } from '@nexahome/ai';
import type { DeviceGateway } from '../device-core/device.gateway';
import { NexaService } from './nexa.service';
import type { NexaToolDefinition } from './nexa-tools.service';

/** Satu tool call yang diminta model (format OpenAI function calling). */
interface FakeToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

const toolDefs: NexaToolDefinition[] = [
  { name: 'get_devices', description: 'd', parameters: { type: 'object' } },
  { name: 'turn_on_device', description: 'd', parameters: { type: 'object' } },
];

function toolCallMessage(
  name: string,
  args: Record<string, unknown>,
  id = 'call_1',
): ChatMessage {
  const call: FakeToolCall = {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
  return { role: 'assistant', content: '', tool_calls: [call] };
}

function textMessage(content: string): ChatMessage {
  return { role: 'assistant', content };
}

describe('NexaService', () => {
  let configValues: Record<string, string | undefined>;
  let config: { get: ReturnType<typeof vi.fn> };
  let tools: {
    getToolDefinitions: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };
  let gateway: { emitNexaState: ReturnType<typeof vi.fn> };
  let providerChat: ReturnType<typeof vi.fn>;
  let speechSynthesize: ReturnType<typeof vi.fn>;
  let service: NexaService;

  /** Stub provider yang mengembalikan urutan respons predetermined. */
  function stubProvider(
    responses: AIChatResponse[] | (() => Promise<AIChatResponse>),
  ) {
    messageHistory.length = 0;
    const base =
      typeof responses === 'function'
        ? (_params: { messages: ChatMessage[] }) => responses()
        : (() => {
              let i = 0;
              return () => {
                const response = responses[i++];
                return Promise.resolve(response);
              };
            })();

    providerChat = vi.fn((params: { messages: ChatMessage[] }) => {
      // Array `messages` dimutate in-place oleh service, jadi salin saat
      // dipanggil agar histori tiap iterasi bisa diperiksa terpisah.
      messageHistory.push(params.messages.map((m) => ({ ...m })));
      return base(params);
    });

    // NexaService menyimpan provider pada private field — sisipkan lewat
    // cast agar tidak bergantung pada implementasi internal.
    (service as unknown as { provider: unknown }).provider = {
      name: 'stub',
      chat: providerChat,
    };
  }

  /** Histori `messages` yang tercatat pada setiap panggilan ke provider. */
  const messageHistory: ChatMessage[][] = [];

  beforeEach(() => {
    configValues = {
      AI_PROVIDER: 'mock',
      AI_API_KEY: 'kunci-uji',
      AI_MODEL: 'model-uji',
    };
    config = {
      get: vi.fn((key: string) => configValues[key]),
    };
    tools = {
      getToolDefinitions: vi.fn().mockReturnValue(toolDefs),
      execute: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        result: { n: 1 },
      }),
    };
    gateway = { emitNexaState: vi.fn() };
    speechSynthesize = vi.fn().mockResolvedValue(Buffer.from('audio'));

    service = new NexaService(
      config as unknown as ConfigService,
      tools as never,
      gateway as unknown as DeviceGateway,
    );
    (service as unknown as { speech: unknown }).speech = {
      name: 'stub',
      transcribe: vi.fn(),
      synthesize: speechSynthesize,
    };
  });

  describe('chat — tool-calling loop', () => {
    it('menjalankan tool, memberi umpan balik ke provider, lalu menjawab final', async () => {
      stubProvider([
        { message: toolCallMessage('get_devices', {}, 'call_a') },
        { message: textMessage('Ada 2 lampu di rumah.') },
      ]);

      const result = await service.chat('user_1', 'daftar perangkat');

      expect(tools.execute).toHaveBeenCalledTimes(1);
      expect(tools.execute).toHaveBeenCalledWith('get_devices', {}, { userId: 'user_1' });
      expect(result).toEqual({
        message: 'Ada 2 lampu di rumah.',
        state: 'SUCCESS',
        tool: { name: 'get_devices', success: true },
      });
      expect(providerChat).toHaveBeenCalledTimes(2);
    });

    it('mengirim definisi tool dan system prompt ke provider', async () => {
      stubProvider([{ message: textMessage('Halo!') }]);

      await service.chat('user_1', 'halo');

      const [params] = providerChat.mock.calls[0] as unknown as [
        { messages: ChatMessage[]; tools: NexaToolDefinition[] },
      ];
      expect(params.tools).toEqual(toolDefs);
      const messages = messageHistory[0];
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toMatch(/Nexa/);
      expect(messages[1]).toEqual({ role: 'user', content: 'halo' });
    });

    it('memasukkan hasil tool sebagai pesan role tool dengan tool_call_id yang cocok', async () => {
      stubProvider([
        { message: toolCallMessage('get_devices', {}, 'call_a') },
        { message: textMessage('Selesai.') },
      ]);

      await service.chat('user_1', 'daftar perangkat');

      const secondMessages = messageHistory[1];
      const toolMessage = secondMessages.find((m) => m.role === 'tool');
      expect(toolMessage?.tool_call_id).toBe('call_a');
      expect(JSON.parse(toolMessage?.content ?? '{}')).toEqual({
        success: true,
        message: 'ok',
        result: { n: 1 },
      });
      // Pesan assistant berisi tool_calls harus ikut tersimpan agar histori utuh.
      expect(
        secondMessages.filter((m) => m.role === 'assistant'),
      ).toHaveLength(1);
    });

    it('menjalankan beberapa tool call dalam satu putaran', async () => {
      const multi: ChatMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_devices',
              arguments: JSON.stringify({}),
            },
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'turn_on_device',
              arguments: JSON.stringify({ device_id: 'dev_1' }),
            },
          },
        ],
      };
      stubProvider([{ message: multi }, { message: textMessage('Semua dinyalakan.') }]);

      const result = await service.chat('user_1', 'nyalakan lampu');

      expect(tools.execute).toHaveBeenCalledTimes(2);
      expect(tools.execute).toHaveBeenNthCalledWith(
        2,
        'turn_on_device',
        { device_id: 'dev_1' },
        { userId: 'user_1' },
      );
      // lastTool = call terakhir.
      expect(result.tool).toEqual({ name: 'turn_on_device', success: true });
    });

    it('menjalankan rantai tool dua langkah sebelum jawaban final', async () => {
      stubProvider([
        { message: toolCallMessage('get_devices', {}, 'call_a') },
        {
          message: toolCallMessage('turn_on_device', { device_id: 'dev_1' }, 'call_b'),
        },
        { message: textMessage('Lampu sudah menyala.') },
      ]);

      const result = await service.chat('user_1', 'nyalakan lampu di kamar');

      expect(tools.execute).toHaveBeenNthCalledWith(
        1,
        'get_devices',
        {},
        { userId: 'user_1' },
      );
      expect(tools.execute).toHaveBeenNthCalledWith(
        2,
        'turn_on_device',
        { device_id: 'dev_1' },
        { userId: 'user_1' },
      );
      expect(providerChat).toHaveBeenCalledTimes(3);
      expect(result.state).toBe('SUCCESS');
    });

    it('mengembalikan state ERROR ketika tool gagal tetapi tetap menjawab', async () => {
      tools.execute.mockResolvedValue({
        success: false,
        message: 'Perangkat tidak ditemukan.',
        result: null,
      });
      stubProvider([
        { message: toolCallMessage('turn_on_device', { device_id: 'x' }, 'call_a') },
        { message: textMessage('Perangkatnya tidak ada.') },
      ]);

      const result = await service.chat('user_1', 'nyalakan lampu x');

      expect(result.state).toBe('ERROR');
      expect(result.tool).toEqual({ name: 'turn_on_device', success: false });
      expect(result.message).toBe('Perangkatnya tidak ada.');
    });

    it('menangani argumen tool JSON rusak tanpa melempar error', async () => {
      stubProvider([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_bad',
                type: 'function',
                function: { name: 'turn_on_device', arguments: '{rusak' },
              },
            ],
          },
        },
        { message: textMessage('Boleh dikoreksi.') },
      ]);

      const result = await service.chat('user_1', 'nyalakan');

      expect(tools.execute).toHaveBeenCalledWith('turn_on_device', {}, { userId: 'user_1' });
      expect(result.message).toBe('Boleh dikoreksi.');
    });

    it('menggunakan fallback teks ketika assistant tidak mengirim content', async () => {
      stubProvider([{ message: { role: 'assistant', content: '' } }]);

      const result = await service.chat('user_1', 'halo');

      expect(result.message).toBe('Maaf, saya tidak bisa menjawab itu.');
      expect(result.state).toBe('SUCCESS');
      expect(result.tool).toBeUndefined();
    });

    it('menghentikan loop pada batas iterasi dan mengembalikan pesan fallback', async () => {
      // Selalu meminta tool → loop habis tanpa jawaban final.
      stubProvider(() =>
        Promise.resolve({ message: toolCallMessage('get_devices', {}, 'call_x') }),
      );

      const result = await service.chat('user_1', 'daftar perangkat');

      expect(providerChat).toHaveBeenCalledTimes(4);
      expect(tools.execute).toHaveBeenCalledTimes(4);
      expect(result.message).toBe('Selesai.');
      expect(result.state).toBe('SUCCESS');
    });

    it('menyatakan ERROR pada batas iterasi bila tool terakhir gagal', async () => {
      tools.execute.mockResolvedValue({
        success: false,
        message: 'Gagal',
        result: null,
      });
      stubProvider(() =>
        Promise.resolve({ message: toolCallMessage('get_devices', {}, 'call_x') }),
      );

      const result = await service.chat('user_1', 'daftar perangkat');

      expect(result.message).toBe('Maaf, perintah belum selesai diproses.');
      expect(result.state).toBe('ERROR');
    });
  });

  describe('chat — broadcast state WebSocket', () => {
    it('memancarkan THINKING lalu PROCESSING lalu state akhir', async () => {
      stubProvider([
        { message: toolCallMessage('get_devices', {}, 'call_a') },
        { message: textMessage('Selesai.') },
      ]);

      await service.chat('user_1', 'daftar perangkat');

      const states = gateway.emitNexaState.mock.calls.map(
        (call: unknown[]) => call[1],
      );
      expect(states).toEqual(['THINKING', 'PROCESSING', 'SUCCESS']);
    });

    it('memancarkan SUCCESS tanpa PROCESSING bila tidak ada tool call', async () => {
      stubProvider([{ message: textMessage('Halo.') }]);

      await service.chat('user_1', 'halo');

      expect(
        gateway.emitNexaState.mock.calls.map((call: unknown[]) => call[1]),
      ).toEqual(['THINKING', 'SUCCESS']);
    });
  });

  describe('chat — fallback saat provider gagal', () => {
    it('mengembalikan state ERROR, bukan menolak promise', async () => {
      stubProvider(() => Promise.reject(new Error('Rate limit 429.')));

      const result = await service.chat('user_1', 'halo');

      expect(result).toEqual({
        message:
          'Maaf, aku sedang kesulitan berpikir. Coba lagi sebentar, atau ' +
          'perintah langsung dari dashboard.',
        state: 'ERROR',
        degraded: 'llm_unavailable',
      });
      // Detail provider hanya ke log server, tidak dibocorkan ke client.
      expect(result.message).not.toContain('429');
      expect(gateway.emitNexaState).toHaveBeenCalledWith(
        '',
        'ERROR',
        result.message,
      );
    });

    it('menangani error non-Error dari provider', async () => {
      stubProvider(() => Promise.reject('jaringan mati'));

      const result = await service.chat('user_1', 'halo');

      expect(result.state).toBe('ERROR');
      expect(result.degraded).toBe('llm_unavailable');
      expect(result.message).toMatch(/kesulitan berpikir/i);
    });

    it('menangkap error dari NexaToolsService tanpa menggagalkan percakapan', async () => {
      tools.execute.mockRejectedValue(new Error('tools meledak'));
      stubProvider([
        { message: toolCallMessage('get_devices', {}, 'call_a') },
        { message: textMessage('Tidak bisa diproses.') },
      ]);

      const result = await service.chat('user_1', 'daftar perangkat');

      expect(result.state).toBe('ERROR');
      expect(result.degraded).toBe('llm_unavailable');
      expect(result.message).toMatch(/kesulitan berpikir/i);
    });
  });

  describe('konfigurasi provider', () => {
    it('membuat provider dari factory memakai konfigurasi env', async () => {
      configValues.AI_BASE_URL = 'http://localhost:11434/v1';
      service = new NexaService(
        config as unknown as ConfigService,
        tools as never,
        gateway as unknown as DeviceGateway,
      );

      // Tanpa stubbing internal, chat memakai provider factory (mock).
      const result = await service.chat('user_1', 'halo apa kabar');

      expect(config.get).toHaveBeenCalledWith('AI_PROVIDER');
      expect(config.get).toHaveBeenCalledWith('AI_API_KEY');
      expect(config.get).toHaveBeenCalledWith('AI_BASE_URL');
      expect(config.get).toHaveBeenCalledWith('AI_MODEL');
      expect(typeof result.message).toBe('string');
      expect(result.state).toBe('SUCCESS');
    });

    it('menyimpan instance provider agar tidak dibuat ulang tiap panggilan', async () => {
      const created = { name: 'stub', chat: vi.fn().mockResolvedValue({ message: textMessage('hai') }) };
      (service as unknown as { provider: unknown }).provider = created;

      await service.chat('user_1', 'satu');
      await service.chat('user_1', 'dua');

      expect(created.chat).toHaveBeenCalledTimes(2);
      expect(config.get).not.toHaveBeenCalledWith('AI_PROVIDER');
    });
  });

  describe('synthesize', () => {
    it('mengembalikan buffer dari speech provider', async () => {
      const buffer = await service.synthesize('halo nexahome');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('audio');
      expect(speechSynthesize).toHaveBeenCalledWith('halo nexahome');
    });

    it('menyekingkan instance speech provider', async () => {
      const created = {
        name: 'stub',
        transcribe: vi.fn(),
        synthesize: vi.fn().mockResolvedValue(Buffer.from('x')),
      };
      (service as unknown as { speech: unknown }).speech = created;

      await service.synthesize('a');
      await service.synthesize('b');

      expect(created.synthesize).toHaveBeenCalledTimes(2);
      expect(config.get).not.toHaveBeenCalledWith('AI_PROVIDER');
    });

    it('membuat speech provider dari factory saat belum di-cache', async () => {
      const service2 = new NexaService(
        config as unknown as ConfigService,
        tools as never,
        gateway as unknown as DeviceGateway,
      );

      const buffer = await service2.synthesize('halo');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(config.get).toHaveBeenCalledWith('AI_PROVIDER');
      expect(config.get).toHaveBeenCalledWith('AI_API_KEY');
    });
  });

  describe('capabilities', () => {
    it('menandai mode mock dan STT kosong sebagai degraded', () => {
      const result = service.capabilities(false);

      expect(result).toEqual({
        aiProvider: 'mock',
        llm: 'mock',
        tts: 'mock',
        stt: { configured: false, engine: 'whisper.cpp' },
        degraded: true,
      });
    });

    it('menandai provider live + STT siap sebagai tidak degraded', () => {
      configValues.AI_PROVIDER = 'deepseek';

      const result = service.capabilities(true);

      expect(result.llm).toBe('live');
      expect(result.tts).toBe('live');
      expect(result.aiProvider).toBe('deepseek');
      expect(result.degraded).toBe(false);
    });

    it('provider live tanpa STT tetap degraded (karena voice off)', () => {
      configValues.AI_PROVIDER = 'deepseek';

      expect(service.capabilities(false).degraded).toBe(true);
    });
  });

  describe('degradation saat chat gagal', () => {
    it('balas teks ramah + ERROR tanpa membocorkan pesan provider', async () => {
      stubProvider(() =>
        Promise.reject(new Error('401 unauthorized, key sk-live-abcd1234')),
      );

      const result = await service.chat('user_1', 'halo');

      expect(result.state).toBe('ERROR');
      expect(result.degraded).toBe('llm_unavailable');
      expect(result.message).not.toContain('sk-live-abcd1234');
      expect(result.message).toMatch(/kesulitan berpikir/i);
      expect(gateway.emitNexaState).toHaveBeenCalledWith(
        '',
        'ERROR',
        result.message,
      );
    });

    it('tool yang gagal ditandai degraded tool_failed', async () => {
      stubProvider([
        { message: toolCallMessage('turn_on_device', { deviceId: 'd1' }) },
        { message: textMessage('Gagal menyalakan.') },
      ]);
      tools.execute.mockResolvedValue({ success: false, error: 'offline' });

      const result = await service.chat('user_1', 'nalakan lampu');

      expect(result.state).toBe('ERROR');
      expect(result.degraded).toBe('tool_failed');
    });
  });
});
