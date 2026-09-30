import type {
  AIChatResponse,
  AIProvider,
  AIProviderConfig,
  ChatMessage,
  DeviceHint,
  ToolCall,
  ToolDefinition,
} from './chat';

/** Base URL default bila tidak di-override lewat konfigurasi. */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Bentuk pesan balasan mentah dari `/chat/completions`. */
interface OpenAICompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      name?: string;
      tool_calls?: ToolCall[];
      tool_call_id?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/**
 * Provider chat yang kompatibel dengan API OpenAI (atau server/proxy apa pun
 * yang meniru endpoint `/chat/completions` — mis. Ollama, LocalAI, OpenRouter).
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai';

  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async chat(params: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    devices?: DeviceHint[];
  }): Promise<AIChatResponse> {
    // Daftar perangkat nyata disisipkan ke system prompt supaya model
    // memakai device_id yang benar alih-alih mengarang ID.
    const messages = withDeviceCatalog(params.messages, params.devices);

    // ToolDefinition dikirim dalam format tools OpenAI: { type: 'function', function: {...} }.
    const body = {
      model: this.config.model,
      messages,
      ...(params.tools && params.tools.length > 0
        ? {
            tools: params.tools.map((tool) => ({
              type: 'function' as const,
              function: tool,
            })),
          }
        : {}),
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI API error (${response.status}): ${detail || response.statusText}`,
      );
    }

    const data = (await response.json()) as OpenAICompletionResponse;
    const raw = data.choices?.[0]?.message;

    const message: ChatMessage = {
      role: (raw?.role as ChatMessage['role']) ?? 'assistant',
      content: typeof raw?.content === 'string' ? raw.content : '',
    };

    // Pertahankan tool_calls serta metadata lain bila ada pada balasan.
    if (raw?.tool_calls) message.tool_calls = raw.tool_calls;
    if (raw?.name) message.name = raw.name;
    if (raw?.tool_call_id) message.tool_call_id = raw.tool_call_id;

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
        }
      : undefined;

    return { message, usage };
  }
}

/**
 * Tambahkan katalog perangkat ke system prompt pertama.
 * Tanpa ini model cenderung mengarang device_id yang tidak ada.
 */
function withDeviceCatalog(
  messages: ChatMessage[],
  devices?: DeviceHint[],
): ChatMessage[] {
  if (!devices || devices.length === 0) return messages;

  const catalog = devices
    .map((d) => {
      const room = d.room ? ` (ruangan: ${d.room})` : '';
      const type = d.type ? ` [${d.type}]` : '';
      return `- ${d.id}: ${d.name}${type}${room}`;
    })
    .join('\n');

  const text =
    'Perangkat yang tersedia di rumah pengguna (device_id|name):\n' +
    catalog +
    '\nGunakan device_id dari daftar ini persis. Jangan mengarang ID.';

  const first = messages[0];
  if (!first) return [{ role: 'system', content: text }, ...messages];
  if (first.role !== 'system') return [{ role: 'system', content: text }, ...messages];

  return [
    { ...first, content: `${first.content}\n\n${text}` },
    ...messages.slice(1),
  ];
}
