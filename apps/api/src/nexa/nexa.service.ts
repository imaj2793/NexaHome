import { Injectable } from '@nestjs/common';
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
}

/**
 * Nexa AI Service (blueprint §11–§14). Provider-independent: membaca konfigurasi
 * AI dari env, memanggil provider lewat abstraction layer, lalu mengeksekusi
 * tool-call lewat NexaToolsService (safety layer §26). Setiap perubahan state
 * di-broadcast lewat WebSocket (§17) agar visual mode (§15) ikut ter-update.
 */
@Injectable()
export class NexaService {
  private provider: AIProvider | null = null;
  private speech: SpeechProvider | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: NexaToolsService,
    private readonly gateway: DeviceGateway,
  ) {}

  private aiConfig() {
    return {
      apiKey: this.config.get<string>('AI_API_KEY') ?? '',
      baseUrl: this.config.get<string>('AI_BASE_URL'),
      model: this.config.get<string>('AI_MODEL') ?? 'deepseek-chat',
    };
  }

  private getProvider(): AIProvider {
    if (!this.provider) {
      const name = this.config.get<string>('AI_PROVIDER')?.trim() || 'mock';
      this.provider = createAIProvider(name, this.aiConfig());
    }
    return this.provider;
  }

  private getSpeechProvider(): SpeechProvider {
    if (!this.speech) {
      const name = this.config.get<string>('AI_PROVIDER')?.trim() || 'mock';
      this.speech = createSpeechProvider(name, this.aiConfig());
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
      const msg = err instanceof Error ? err.message : String(err);
      const result: NexaChatResult = {
        message: `Maaf, terjadi kesalahan: ${msg}`,
        state: 'ERROR',
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
