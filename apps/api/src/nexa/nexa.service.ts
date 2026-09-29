import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  ChatMessage,
  createAIProvider,
  createSpeechProvider,
  SpeechProvider,
} from '@nexahome/ai';
import { DeviceGateway } from '../device-core/device.gateway';
import { NexaToolsService } from './nexa-tools.service';

const SYSTEM_PROMPT = [
  'Kamu adalah Nexa, asisten smart home NexaHome yang ramah dan ringkas.',
  'Kamu mengendalikan perangkat rumah lewat tool yang tersedia.',
  'Selalu pakai tool untuk menyalakan, mematikan, atau mengubah perangkat.',
  'Boleh memanggil beberapa tool berurutan (mis. get_devices untuk tahu ID, lalu turn_on_device).',
  'Jawab dalam Bahasa Indonesia, singkat dan jelas.',
].join(' ');

export interface NexaChatResult {
  message: string;
  state: string;
  tool?: { name: string; success: boolean };
  /** Alasan degradasi agar UI bisa memberi penjelasan (blueprint §27). */
  degraded?: 'llm_unavailable' | 'tool_failed';
}

/** Kemampuan Nexa saat ini — dipakai UI agar mode terbatas terlihat. */
export interface NexaCapabilities {
  aiProvider: string;
  llm: 'mock' | 'live';
  tts: 'mock' | 'live';
  stt: { configured: boolean; engine: string };
  degraded: boolean;
}

/**
 * Nexa AI Service (blueprint §11–§14). Provider-independent: membaca konfigurasi
 * AI dari env, memanggil provider lewat abstraction layer, lalu mengeksekusi
 * tool-call lewat NexaToolsService (safety layer §26). Setiap perubahan state
 * di-broadcast lewat WebSocket (§17) agar visual mode (§15) ikut ter-update.
 */
@Injectable()
export class NexaService {
  private readonly logger = new Logger(NexaService.name);
  private provider: AIProvider | null = null;
  private speech: SpeechProvider | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: NexaToolsService,
    private readonly gateway: DeviceGateway,
  ) {}

  private providerName(): string {
    return this.config.get<string>('AI_PROVIDER')?.trim() || 'mock';
  }

  /**
   * Kemampuan Nexa saat ini. Client memanggilnya untuk membedakan "Nexa sedang
   * berpikir" dari "fitur ini belum dikonfigurasi" — mode mock atau terbatas
   * harus terlihat jelas, bukan disamarkan sebagai error.
   */
  capabilities(sttConfigured: boolean): NexaCapabilities {
    const provider = this.providerName();
    const isMock = provider === 'mock';
    return {
      aiProvider: provider,
      llm: isMock ? 'mock' : 'live',
      tts: isMock ? 'mock' : 'live',
      stt: { configured: sttConfigured, engine: 'whisper.cpp' },
      degraded: isMock || !sttConfigured,
    };
  }

  private aiConfig() {
    return {
      apiKey: this.config.get<string>('AI_API_KEY') ?? '',
      baseUrl: this.config.get<string>('AI_BASE_URL'),
      model: this.config.get<string>('AI_MODEL') ?? 'deepseek-chat',
    };
  }

  private getProvider(): AIProvider {
    if (!this.provider) {
      this.provider = createAIProvider(this.providerName(), this.aiConfig());
    }
    return this.provider;
  }

  private getSpeechProvider(): SpeechProvider {
    if (!this.speech) {
      this.speech = createSpeechProvider(this.providerName(), this.aiConfig());
    }
    return this.speech;
  }

  async chat(userId: string, message: string): Promise<NexaChatResult> {
    this.gateway.emitNexaState('', 'THINKING');
    try {
      const provider = this.getProvider();
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ];

      let lastTool: { name: string; success: boolean } | undefined;
      const maxIterations = 4;

      // Tool-calling multi-turn: eksekusi tool → kirim hasil ke LLM → ulangi
      // sampai LLM memberi jawaban final (tanpa tool_call lagi).
      for (let i = 0; i < maxIterations; i++) {
        const response = await provider.chat({
          messages,
          tools: this.tools.getToolDefinitions(),
        });
        const assistant = response.message;
        messages.push(assistant);

        const calls = assistant.tool_calls ?? [];
        if (calls.length === 0) {
          const result: NexaChatResult = {
            message:
              assistant.content || 'Maaf, saya tidak bisa menjawab itu.',
            state: lastTool && !lastTool.success ? 'ERROR' : 'SUCCESS',
            ...(lastTool ? { tool: lastTool } : {}),
            ...(lastTool && !lastTool.success
              ? { degraded: 'tool_failed' as const }
              : {}),
          };
          this.gateway.emitNexaState('', result.state, result.message);
          return result;
        }

        this.gateway.emitNexaState('', 'PROCESSING');
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || '{}');
          } catch {
            args = {};
          }

          const exec = await this.tools.execute(call.function.name, args, {
            userId,
          });
          lastTool = { name: call.function.name, success: exec.success };

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(exec),
          });
        }
      }

      const result: NexaChatResult = {
        message: lastTool?.success
          ? 'Selesai.'
          : 'Maaf, perintah belum selesai diproses.',
        state: lastTool && !lastTool.success ? 'ERROR' : 'SUCCESS',
        ...(lastTool ? { tool: lastTool } : {}),
      };
      this.gateway.emitNexaState('', result.state, result.message);
      return result;
    } catch (err) {
      // Detail (pesan provider, URL, dst.) hanya ke log server agar tidak
      // membocorkan konfigurasi ke client.
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Chat Nexa gagal: ${detail}`);
      const result: NexaChatResult = {
        message:
          'Maaf, aku sedang kesulitan berpikir. Coba lagi sebentar, atau ' +
          'perintah langsung dari dashboard.',
        state: 'ERROR',
        degraded: 'llm_unavailable',
      };
      this.gateway.emitNexaState('', 'ERROR', result.message);
      return result;
    }
  }

  /** Text-to-speech untuk voice feedback (blueprint §12, §15). */
  async synthesize(text: string): Promise<Buffer> {
    return this.getSpeechProvider().synthesize(text);
  }
}
