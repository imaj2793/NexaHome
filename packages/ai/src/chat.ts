/**
 * Tipe data + kontrak provider AI (chat/completions).
 * Provider-independent — implementasi konkret ada di openai-compatible.ts dan mock.ts.
 */

/** Tool call yang diminta oleh model (format OpenAI function calling). */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON string dari argumen tool call. */
    arguments: string;
  };
}

/** Pesan dalam percakapan. `role` mengikuti konvensi OpenAI. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** Definisi tool yang tersedia bagi model (berisi JSON Schema). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Hasil dari satu pemanggilan chat. */
export interface AIChatResponse {
  message: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/** Perangkat nyata milik user, diteruskan ke provider agar AI memakai ID asli. */
export interface DeviceHint {
  id: string;
  name: string;
  room?: string | null;
  type?: string;
}

/** Kontrak provider AI (chat). */
export interface AIProvider {
  readonly name: string;
  chat(params: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    /**
     * Daftar perangkat milik user. Tanpa ini, provider tidak tahu ID
     * perangkat yang sah dan cenderung mengarang ID fiktif.
     */
    devices?: DeviceHint[];
  }): Promise<AIChatResponse>;
}

/** Konfigurasi provider AI. */
export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}
