import type { AIProviderConfig } from './chat';

/** Kontrak provider speech: transcribe (STT) + synthesize (TTS). */
export interface SpeechProvider {
  readonly name: string;
  transcribe(audio: Buffer, opts?: { language?: string }): Promise<string>;
  synthesize(text: string, opts?: { voice?: string }): Promise<Buffer>;
}

/** Base URL default bila tidak di-override lewat konfigurasi. */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Bentuk balasan dari `/audio/transcriptions`. */
interface OpenAITranscriptionResponse {
  text?: string;
}

/**
 * Provider speech via endpoint OpenAI-compatible:
 * `/audio/transcriptions` (STT) dan `/audio/speech` (TTS).
 */
export class OpenAICompatibleSpeechProvider implements SpeechProvider {
  readonly name = 'openai';

  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async transcribe(audio: Buffer, opts?: { language?: string }): Promise<string> {
    const form = new FormData();
    form.append('model', this.config.model || 'whisper-1');
    form.append('file', new Blob([audio]), 'audio.webm');
    if (opts?.language) form.append('language', opts.language);

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI speech API error (${response.status}): ${detail || response.statusText}`,
      );
    }

    const data = (await response.json()) as OpenAITranscriptionResponse;
    return data.text ?? '';
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<Buffer> {
    const body = {
      model: 'tts-1',
      voice: opts?.voice ?? 'alloy',
      input: text,
    };

    const response = await fetch(`${this.baseUrl}/audio/speech`, {
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
        `OpenAI speech API error (${response.status}): ${detail || response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

/** Provider speech mock — tidak melakukan network apa pun (untuk dev/test). */
export class MockSpeechProvider implements SpeechProvider {
  readonly name = 'mock';

  async transcribe(
    _audio: Buffer,
    _opts?: { language?: string },
  ): Promise<string> {
    return '';
  }

  async synthesize(_text: string, _opts?: { voice?: string }): Promise<Buffer> {
    return Buffer.from('mock-audio');
  }
}
