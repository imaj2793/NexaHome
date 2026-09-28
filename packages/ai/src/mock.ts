import type {
  AIChatResponse,
  AIProvider,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from './chat';

/** Infer device_id dari teks perintah (ID/EN). */
function inferDeviceId(text: string): string {
  if (/kamar|bedroom/i.test(text)) return 'device_bedroom_light';
  if (/ruang tamu|living/i.test(text)) return 'device_living_light';
  return 'device_living_light';
}

/** Ekstrak angka pertama dari teks (untuk nilai brightness), default 60. */
function inferBrightnessValue(text: string): number {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 60;
}

/** Buat id tool call acak berbentuk `call_xxxx`. */
function makeCallId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}`;
}

/** Susun pesan assistant berisi satu tool call. */
function toolCallMessage(
  name: string,
  args: Record<string, unknown>,
): ChatMessage {
  const toolCall: ToolCall = {
    id: makeCallId(),
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };

  return { role: 'assistant', content: '', tool_calls: [toolCall] };
}

/**
 * Provider AI mock — deterministik, tanpa network.
 * Memetakan perintah pengguna (ID/EN) menjadi tool call, cocok untuk dev/test
 * tanpa API key.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async chat(params: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
  }): Promise<AIChatResponse> {
    // Intent diambil dari pesan user terakhir.
    const lastUser = [...params.messages]
      .reverse()
      .find((m) => m.role === 'user');
    const text = (lastUser?.content ?? '').toLowerCase();

    if (/terang|redup|brightness|kecerahan/.test(text)) {
      return {
        message: toolCallMessage('set_brightness', {
          device_id: inferDeviceId(text),
          value: inferBrightnessValue(text),
        }),
      };
    }

    if (/nyalakan|turn on/.test(text)) {
      return {
        message: toolCallMessage('turn_on_device', {
          device_id: inferDeviceId(text),
        }),
      };
    }

    if (/matikan|turn off/.test(text)) {
      return {
        message: toolCallMessage('turn_off_device', {
          device_id: inferDeviceId(text),
        }),
      };
    }

    if (/daftar perangkat|perangkat|devices/.test(text)) {
      return {
        message: toolCallMessage('get_devices', {}),
      };
    }

    if (/status/.test(text)) {
      return {
        message: toolCallMessage('get_device_status', {
          device_id: inferDeviceId(text),
        }),
      };
    }

    // Fallback: balasan teks biasa.
    return {
      message: {
        role: 'assistant',
        content:
          "Baik, saya belum mengerti perintah itu. Coba: 'nyalakan lampu kamar' atau 'matikan lampu ruang tamu'.",
      },
    };
  }
}
