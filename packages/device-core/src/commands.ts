import { IntegrationCommand } from './integration';

/**
 * Konversi aksi (turn_on / turn_off / set_brightness / set_color /
 * set_temperature / set_color_temperature) menjadi perintah capability netral.
 *
 * `set_temperature` = suhu AC (°C); `set_color_temperature` = suhu warna lampu
 * (K). Keduanya sengaja dipisah: spec §4 memberi AC capability `temperature`
 * dan lampu capability `color_temperature`, dan menggabungkannya membuat
 * validasi capability mustahil.
 */
export function toIntegrationCommand(
  action: string,
  value?: unknown,
): IntegrationCommand {
  switch (action) {
    case 'turn_on':
      return { capability: 'power', value: true };
    case 'turn_off':
      return { capability: 'power', value: false };
    case 'set_brightness':
      return { capability: 'brightness', value: clampBrightness(value) };
    case 'set_color':
      return { capability: 'color', value };
    case 'set_temperature':
      return { capability: 'temperature', value };
    case 'set_color_temperature':
      return { capability: 'color_temperature', value };
    default:
      throw new Error(`Aksi tidak dikenal: ${action}`);
  }
}

/**
 * Terapkan aksi langsung pada state (untuk perangkat "virtual" tanpa
 * integration). Digunakan juga sebagai fallback di Device Core.
 */
export function applyCommandToState(
  state: Record<string, unknown>,
  action: string,
  value?: unknown,
): Record<string, unknown> {
  const command = toIntegrationCommand(action, value);
  const next: Record<string, unknown> = { ...state };

  switch (command.capability) {
    case 'power':
      next.power = command.value;
      break;
    case 'brightness': {
      const b = command.value as number;
      next.brightness = b;
      next.power = b > 0;
      break;
    }
    case 'color':
      next.color = command.value;
      break;
    case 'temperature':
      next.temperature = command.value;
      break;
    case 'color_temperature':
      next.color_temperature = command.value;
      break;
  }

  return next;
}

/** Pesan aktivitas (Bahasa Indonesia) untuk sebuah aksi. */
export function humanizeCommand(
  deviceName: string,
  action: string,
  value?: unknown,
): string {
  switch (action) {
    case 'turn_on':
      return `${deviceName} dinyalakan.`;
    case 'turn_off':
      return `${deviceName} dimatikan.`;
    case 'set_brightness':
      return `${deviceName} kecerahan ${value}%.`;
    case 'set_color':
      return `${deviceName} warna diubah.`;
    case 'set_temperature':
      return `${deviceName} disetel ke ${value}°C.`;
    case 'set_color_temperature':
      return `${deviceName} suhu warna ${value}K.`;
    default:
      return `${deviceName} diperbarui.`;
  }
}

function clampBrightness(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
