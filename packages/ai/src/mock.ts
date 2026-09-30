import type {
  AIChatResponse,
  AIProvider,
  ChatMessage,
  ToolCall,
  DeviceHint,
  ToolDefinition,
} from './chat';

/**
 * Cocokkan teks perintah dengan perangkat milik user.
 *
 * Sebelumnya provider mock mengembalikan ID hardcode ('device_living_light')
 * yang tidak pernah ada di database anymore — hasil devices selalu gagal
 * dengan "Perangkat tidak ditemukan". Sekarang nama perangkat diiocokkan
 * dengan teks perintah; bila tidak ada yang cocok, kembalikan undefined
 * supaya tool melaporkan "Perangkat tidak ditemukan" dengan jujur.
 */
function matchDevice(text: string, devices: DeviceHint[]): DeviceHint | undefined {
  if (devices.length === 0) return undefined;

  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const haystack = norm(text);

  // Cocokkan berdasarkan nama perangkat atau nama ruangan, terpanjang dulu
  // supaya "lampu tamu" tidak tertimpa oleh "tamu".
  const scored = devices
    .map((d) => {
      const name = norm(d.name);
      const room = d.room ? norm(d.room) : '';
      const nameWords = name.split(' ').filter(Boolean);
      let score = 0;
      if (name && haystack.includes(name)) score = 100 + name.length;
      else if (nameWords.length > 1 && nameWords.every((w) => haystack.includes(w))) {
        score = 80 + name.length;
      } else if (room && haystack.includes(room)) score = 60 + room.length;
      else if (nameWords.some((w) => w.length > 3 && haystack.includes(w))) {
        score = 20 + name.length;
      }
      return { device: d, score };
    })
    .filter((s2) => s2.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.device;
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
    devices?: DeviceHint[];
  }): Promise<AIChatResponse> {
    // Kalau pesan terakhir adalah hasil tool, loop tool-calling sudah
    // menjalankan perintahnya. Tanpa pengecekan ini provider mock
    //ebolos mengembalikan tool call yang sama lagi, sehingga satu perintah
    // dikirim ke perangkat berulang kali (teramati 4× pada loop maxIterations).
    const lastMessage = params.messages[params.messages.length - 1];
    if (lastMessage?.role === 'tool') {
      return { message: { role: 'assistant', content: 'Selesai.' } };
    }

    // Intent diambil dari pesan user terakhir.
    const lastUser = [...params.messages]
      .reverse()
      .find((m) => m.role === 'user');
    const text = (lastUser?.content ?? '').toLowerCase();

    if (/terang|redup|brightness|kecerahan/.test(text)) {
      return {
        message: toolCallMessage('set_brightness', {
          device_id: matchDevice(text, params.devices ?? [])?.id ?? '',
          value: inferBrightnessValue(text),
        }),
      };
    }

    if (/nyalakan|turn on/.test(text)) {
      return {
        message: toolCallMessage('turn_on_device', {
          device_id: matchDevice(text, params.devices ?? [])?.id ?? '',
        }),
      };
    }

    if (/matikan|turn off/.test(text)) {
      return {
        message: toolCallMessage('turn_off_device', {
          device_id: matchDevice(text, params.devices ?? [])?.id ?? '',
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
          device_id: matchDevice(text, params.devices ?? [])?.id ?? ''
        }),
      };
    }

    if (/scene|movie|suasana|mode/.test(text)) {
      return {
        message: toolCallMessage('activate_scene', {
          scene_name: 'movie night',
        }),
      };
    }

    if (/energi|energy|pemakaian|watt|daya/.test(text)) {
      return {
        message: toolCallMessage('get_energy_usage', {}),
      };
    }

    if (/automation|otomasi|jadwal|setiap/.test(text)) {
      return {
        message: toolCallMessage('create_automation', {
          description: lastUser?.content ?? 'Automation baru',
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
