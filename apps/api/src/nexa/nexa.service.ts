import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, ChatMessage, createAIProvider } from '@nexahome/ai';
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
 * tool-call lewat NexaToolsService (yang dijaga safety layer §26).
 */
@Injectable()
export class NexaService {
  private provider: AIProvider | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: NexaToolsService,
    private readonly gateway: DeviceGateway,
  ) {}

  private getProvider(): AIProvider {
    if (!this.provider) {
      const name = this.config.get<string>('AI_PROVIDER')?.trim() || 'mock';
      this.provider = createAIProvider(name, {
        apiKey: this.config.get<string>('AI_API_KEY') ?? '',
        model: this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini',
      });
    }
    return this.provider;
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

        const exec = await this.tools.execute(call.function.name, args, {
          userId,
        });

        return {
          message: exec.success ? exec.message : `Maaf, ${exec.message}`,
          state: exec.success ? 'HAPPY' : 'WARNING',
          tool: { name: call.function.name, success: exec.success },
        };
      }

      return {
        message: assistant.content || 'Maaf, saya tidak bisa menjawab itu.',
        state: 'SPEAKING',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { message: `Maaf, terjadi kesalahan: ${msg}`, state: 'ERROR' };
    } finally {
      this.gateway.emitNexaState('', 'SPEAKING');
    }
  }
}
