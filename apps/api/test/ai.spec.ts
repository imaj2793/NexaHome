import {
  createAIProvider,
  createSpeechProvider,
  MockAIProvider,
  MockSpeechProvider,
  OpenAICompatibleProvider,
  OpenAICompatibleSpeechProvider,
  type AIChatResponse,
  type ChatMessage,
  type ToolDefinition,
} from '@nexahome/ai';

const tools: ToolDefinition[] = [
  {
    name: 'turn_on_device',
    description: 'Nyalakan perangkat.',
    parameters: { type: 'object', properties: { device_id: { type: 'string' } } },
  },
];

/** Bangun balasan fetch minimal yang valid. */
function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  };
}

describe('@nexahome/ai — MockAIProvider', () => {
  let provider: MockAIProvider;

  const ask = (content: string, extra: ChatMessage[] = []) =>
    provider.chat({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content },
        ...extra,
      ],
      tools,
    });

  beforeEach(() => {
    provider = new MockAIProvider();
  });

  it('memiliki nama provider mock', () => {
    expect(provider.name).toBe('mock');
  });

  it('memetakan perintah nyalakan lampu ke tool turn_on_device', async () => {
    const response: AIChatResponse = await ask('nyalakan lampu kamar');

    const call = response.message.tool_calls?.[0];
    expect(call?.type).toBe('function');
    expect(call?.function.name).toBe('turn_on_device');
    expect(JSON.parse(call?.function.arguments ?? '{}')).toEqual({
      device_id: 'device_bedroom_light',
    });
  });

  it('memetakan perintah matikan ke tool turn_off_device', async () => {
    const response = await ask('matikan lampu ruang tamu');

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'turn_off_device',
    );
    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toEqual({ device_id: 'device_living_light' });
  });

  it('menerjemahkan bahasa Inggris ke tool yang sama', async () => {
    const response = await ask('turn on the lamp in the bedroom');

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'turn_on_device',
    );
  });

  it('mengekstrak nilai kecerahan dari teks perintah', async () => {
    const response = await ask('setel kecerahan kamar jadi 30');

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'set_brightness',
    );
    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toEqual({ device_id: 'device_bedroom_light', value: 30 });
  });

  it('memakai nilai kecerahan default 60 bila tidak ada angka', async () => {
    const response = await ask('redupkan lampu');

    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toMatchObject({ value: 60 });
  });

  it('memetakan permintaan daftar perangkat ke tool get_devices tanpa argumen', async () => {
    const response = await ask('tampilkan daftar perangkat');

    expect(response.message.tool_calls?.[0]?.function.name).toBe('get_devices');
    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toEqual({});
  });

  it('memetakan permintaan status ke get_device_status dengan device default', async () => {
    const response = await ask('apa status lampu?');

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'get_device_status',
    );
    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toEqual({ device_id: 'device_living_light' });
  });

  it('memetakan permintaan scene ke activate_scene movie night', async () => {
    const response = await ask('aktifkan mode movie');

    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toEqual({ scene_name: 'movie night' });
  });

  it('memetakan permintaan energi ke get_energy_usage', async () => {
    const response = await ask('berapa pemakaian daya sekarang?');

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'get_energy_usage',
    );
  });

  it('memetakan permintaan otomatisasi ke create_automation dengan deskripsi asli', async () => {
    // Kata 'nyalakan' dicek lebih dulu, jadi hindari frasa itu di sini.
    const prompt = 'buat otomatisasi setiap hari jam 6 pagi';
    const response = await ask(prompt);

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'create_automation',
    );
    expect(
      JSON.parse(response.message.tool_calls?.[0]?.function.arguments ?? '{}'),
    ).toEqual({ description: prompt });
  });

  it('mengembalikan balasan teks tanpa tool call untuk perintah tak dikenali', async () => {
    const response = await ask('apa kabar?');

    expect(response.message.tool_calls).toBeUndefined();
    expect(response.message.role).toBe('assistant');
    expect(response.message.content).toMatch(/belum mengerti/);
  });

  it('menghasilkan id tool call unik format call_ prefixed', async () => {
    const first = await ask('nyalakan lampu');
    const second = await ask('nyalakan lampu');

    const idA = first.message.tool_calls?.[0]?.id;
    const idB = second.message.tool_calls?.[0]?.id;
    expect(idA).toMatch(/^call_[a-z0-9]+$/);
    expect(idB).toMatch(/^call_[a-z0-9]+$/);
    expect(idA).not.toBe(idB);
  });

  it('mengambil intent dari pesan user terakhir pada percakapan panjang', async () => {
    const response = await provider.chat({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'nyalakan lampu' },
        { role: 'tool', content: '{"success":true}', tool_call_id: 'c1' },
        { role: 'assistant', content: 'Lampu dinyalakan.' },
        { role: 'user', content: 'matikan lampu ruang tamu' },
      ],
      tools,
    });

    expect(response.message.tool_calls?.[0]?.function.name).toBe(
      'turn_off_device',
    );
  });

  it('mengembalikan balasan fallback bila tidak ada pesan user sama sekali', async () => {
    const response = await provider.chat({ messages: [] });

    expect(response.message.tool_calls).toBeUndefined();
    expect(response.message.content.length).toBeGreaterThan(0);
  });
});

describe('@nexahome/ai — MockSpeechProvider', () => {
  let provider: MockSpeechProvider;

  beforeEach(() => {
    provider = new MockSpeechProvider();
  });

  it('memiliki nama provider mock', () => {
    expect(provider.name).toBe('mock');
  });

  it('mengembalikan string kosong untuk transcribe tanpa network', async () => {
    await expect(provider.transcribe(Buffer.from('audio'))).resolves.toBe('');
  });

  it('mengembalikan buffer mock untuk synthesize', async () => {
    const audio = await provider.synthesize('halo nexahome');

    expect(Buffer.isBuffer(audio)).toBe(true);
    expect(audio.toString()).toBe('mock-audio');
  });

  it('tetap deterministik pada panggilan synthesize berulang', async () => {
    const a = await provider.synthesize('satu');
    const b = await provider.synthesize('dua');

    expect(a.equals(b)).toBe(true);
  });
});

describe('@nexahome/ai — createAIProvider', () => {
  const config = { apiKey: 'kunci', model: 'model-uji' };

  it('mengembalikan MockAIProvider untuk nama mock', () => {
    const provider = createAIProvider('mock', config);

    expect(provider).toBeInstanceOf(MockAIProvider);
    expect(provider.name).toBe('mock');
  });

  it('mengembalikan OpenAICompatibleProvider untuk nama openai', () => {
    const provider = createAIProvider('openai', config);

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe('openai');
  });

  it('mengembalikan provider OpenAI-compatible untuk nama vendor lain', () => {
    for (const name of ['deepseek', 'ollama', 'openrouter', 'localai', '']) {
      expect(createAIProvider(name, config)).toBeInstanceOf(
        OpenAICompatibleProvider,
      );
    }
  });

  it('tidak melakukan network saat membuat provider mock', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    createAIProvider('mock', config);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('@nexahome/ai — createSpeechProvider', () => {
  const config = { apiKey: 'kunci', model: 'whisper-1' };

  it('mengembalikan MockSpeechProvider untuk nama mock', () => {
    expect(createSpeechProvider('mock', config)).toBeInstanceOf(
      MockSpeechProvider,
    );
  });

  it('mengembalikan OpenAICompatibleSpeechProvider untuk nama openai', () => {
    const provider = createSpeechProvider('openai', config);

    expect(provider).toBeInstanceOf(OpenAICompatibleSpeechProvider);
    expect(provider.name).toBe('openai');
  });

  it('mengembalikan provider speech OpenAI-compatible untuk nama lain', () => {
    expect(createSpeechProvider('deepseek', config)).toBeInstanceOf(
      OpenAICompatibleSpeechProvider,
    );
  });
});

describe('@nexahome/ai — OpenAICompatibleProvider', () => {
  const config = {
    apiKey: 'sk-uji-123',
    model: 'deepseek-chat',
    baseUrl: 'https://api.ujitest.local/v1',
  };
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mengirim POST ke /chat/completions dengan header dan body yang benar', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'Halo!' } }],
        usage: { prompt_tokens: 11, completion_tokens: 5 },
      }),
    );
    const provider = new OpenAICompatibleProvider(config);

    const messages: ChatMessage[] = [{ role: 'user', content: 'halo' }];
    await provider.chat({ messages, tools });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.ujitest.local/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk-uji-123',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toEqual(messages);
    // Tool dikirim dalam format OpenAI { type: 'function', function: {...} }.
    expect(body.tools).toEqual([
      { type: 'function', function: tools[0] },
    ]);
  });

  it('memakai base URL default OpenAI bila konfigurasi kosong', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      apiKey: 'k',
      model: 'gpt-4o-mini',
    });

    await provider.chat({ messages: [] });

    expect(fetchStub.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('menghilangkan field tools saat tidak ada tool yang diberikan', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = new OpenAICompatibleProvider(config);

    await provider.chat({ messages: [] });

    const body = JSON.parse(
      (fetchStub.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.tools).toBeUndefined();
  });

  it('menghilangkan field tools saat daftar tool kosong', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = new OpenAICompatibleProvider(config);

    await provider.chat({ messages: [], tools: [] });

    const body = JSON.parse(
      (fetchStub.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.tools).toBeUndefined();
  });

  it('memetakan balasan teks beserta usage ke AIChatResponse', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'Halo!' } }],
        usage: { prompt_tokens: 11, completion_tokens: 5 },
      }),
    );
    const provider = new OpenAICompatibleProvider(config);

    const response = await provider.chat({ messages: [] });

    expect(response.message).toEqual({
      role: 'assistant',
      content: 'Halo!',
    });
    expect(response.usage).toEqual({
      promptTokens: 11,
      completionTokens: 5,
    });
  });

  it('mempertahankan tool_calls dari balasan provider', async () => {
    const toolCalls = [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'get_devices', arguments: '{}' },
      },
    ];
    fetchStub.mockResolvedValue(
      jsonResponse({
        choices: [
          { message: { role: 'assistant', content: null, tool_calls: toolCalls } },
        ],
      }),
    );
    const provider = new OpenAICompatibleProvider(config);

    const response = await provider.chat({ messages: [] });

    expect(response.message.tool_calls).toEqual(toolCalls);
    // content null dinormalisasi menjadi string kosong.
    expect(response.message.content).toBe('');
  });

  it('mempertahankan name dan tool_call_id dari balasan', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              role: 'tool',
              content: '{"success":true}',
              name: 'get_devices',
              tool_call_id: 'call_1',
            },
          },
        ],
      }),
    );
    const provider = new OpenAICompatibleProvider(config);

    const response = await provider.chat({ messages: [] });

    expect(response.message.role).toBe('tool');
    expect(response.message.name).toBe('get_devices');
    expect(response.message.tool_call_id).toBe('call_1');
  });

  it('mengembalikan pesan kosong bila balasan tidak memuat choices', async () => {
    fetchStub.mockResolvedValue(jsonResponse({}));
    const provider = new OpenAICompatibleProvider(config);

    const response = await provider.chat({ messages: [] });

    expect(response.message).toEqual({ role: 'assistant', content: '' });
    expect(response.usage).toBeUndefined();
  });

  it('mengembalikan usage dengan nilai 0 bila field token hilang', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hai' } }],
        usage: {},
      }),
    );
    const provider = new OpenAICompatibleProvider(config);

    const response = await provider.chat({ messages: [] });

    expect(response.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it('melempar error deskriptif saat API mengembalikan status error', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse(
        { error: { message: 'rate limited' } },
        { ok: false, status: 429, statusText: 'Too Many Requests' },
      ),
    );
    const provider = new OpenAICompatibleProvider(config);

    await expect(provider.chat({ messages: [] })).rejects.toThrow(
      /OpenAI API error \(429\)/,
    );
  });

  it('memakai statusText sebagai detail bila body error kosong', async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(''),
    });
    const provider = new OpenAICompatibleProvider(config);

    await expect(provider.chat({ messages: [] })).rejects.toThrow(
      'OpenAI API error (500): Internal Server Error',
    );
  });
});

describe('@nexahome/ai — OpenAICompatibleSpeechProvider', () => {
  const config = {
    apiKey: 'sk-uji-123',
    model: 'whisper-1',
    baseUrl: 'https://api.ujitest.local/v1',
  };
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mengirim multipart FormData ke /audio/transcriptions', async () => {
    fetchStub.mockResolvedValue(jsonResponse({ text: 'halo nexahome' }));
    const provider = new OpenAICompatibleSpeechProvider(config);

    const text = await provider.transcribe(Buffer.from('audio-webm'), {
      language: 'id',
    });

    expect(text).toBe('halo nexahome');
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.ujitest.local/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-uji-123' });
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('id');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('mengembalikan string kosong bila field text tidak ada', async () => {
    fetchStub.mockResolvedValue(jsonResponse({}));
    const provider = new OpenAICompatibleSpeechProvider(config);

    await expect(provider.transcribe(Buffer.from('a'))).resolves.toBe('');
  });

  it('melempar error saat endpoint transkripsi gagal', async () => {
    fetchStub.mockResolvedValue(
      jsonResponse({}, { ok: false, status: 400, statusText: 'Bad Request' }),
    );
    const provider = new OpenAICompatibleSpeechProvider(config);

    await expect(provider.transcribe(Buffer.from('a'))).rejects.toThrow(
      /OpenAI speech API error \(400\)/,
    );
  });

  it('mengirim POST /audio/speech dan mengubah arrayBuffer menjadi Buffer', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    const provider = new OpenAICompatibleSpeechProvider(config);

    const audio = await provider.synthesize('halo', { voice: 'nova' });

    expect(Buffer.isBuffer(audio)).toBe(true);
    expect([...audio]).toEqual([1, 2, 3, 4]);

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.ujitest.local/v1/audio/speech');
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk-uji-123',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'tts-1',
      voice: 'nova',
      input: 'halo',
    });
  });

  it('memakai voice alloy sebagai nilai default', async () => {
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    const provider = new OpenAICompatibleSpeechProvider(config);

    await provider.synthesize('halo');

    const body = JSON.parse(
      (fetchStub.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.voice).toBe('alloy');
  });

  it('melempar error saat endpoint speech gagal', async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('overloaded'),
    });
    const provider = new OpenAICompatibleSpeechProvider(config);

    await expect(provider.synthesize('halo')).rejects.toThrow(
      'OpenAI speech API error (503): overloaded',
    );
  });
});
