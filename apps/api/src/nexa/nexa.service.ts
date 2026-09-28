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
      model: this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini',
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

      const response = await provider.chat({
        messages,
        tools: this.tools.getToolDefinitions(),
      });

      const assistant = response.message;

      // Tool calling: eksekusi tool pertama (satu iterasi untuk MVP).
      if (assistant.tool_calls && assistant.tool_calls.length > 0) {
        const call = assistant.tool_calls[0];
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }

        this.gateway.emitNexaState('', 'PROCESSING');
        const exec = await this.tools.execute(call.function.name, args, {
          userId,
        });

        const result: NexaChatResult = {
          message: exec.success ? exec.message : `Maaf, ${exec.message}`,
          state: exec.success ? 'SUCCESS' : 'ERROR',
          tool: { name: call.function.name, success: exec.success },
        };
        this.gateway.emitNexaState('', result.state, result.message);
        return result;
      }

      const result: NexaChatResult = {
        message: assistant.content || 'Maaf, saya tidak bisa menjawab itu.',
        state: 'SUCCESS',
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
