import {
  AirVent,
  Blinds,
  Fan,
  LampDesk,
  Lightbulb,
  Plug,
  Radio,
  Snowflake,
  Thermometer,
  Tv,
  type LucideIcon,
} from 'lucide-react';

/**
 * Pemetaan tipe perangkat ke ikon dan label.
 *
 * Sebelumnya tiap tipe memakai emoji. Emoji berubah tampilan antar OS,
 * tidak bisa diwarnai, dan terlihat tidak konsisten di kartu perangkat —
 * karena itu diganti ikon SVG satu sumber kebenaran ini.
 */
const TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  light: { icon: Lightbulb, label: 'Lampu' },
  lamp: { icon: LampDesk, label: 'Lampu' },
  bulb: { icon: Lightbulb, label: 'Lampu' },
  ac: { icon: Snowflake, label: 'AC' },
  tv: { icon: Tv, label: 'TV' },
  fan: { icon: Fan, label: 'Kipas' },
  sensor: { icon: Radio, label: 'Sensor' },
  switch: { icon: Plug, label: 'Saklar' },
  thermostat: { icon: Thermometer, label: 'Termostat' },
  plug: { icon: Plug, label: 'Colokan' },
  blinds: { icon: Blinds, label: 'Tirai' },
  airvent: { icon: AirVent, label: 'Ventilasi' },
};

const FALLBACK = { icon: Plug, label: 'Perangkat' };

export function deviceMeta(type: string): { icon: LucideIcon; label: string } {
  return TYPE_META[type.toLowerCase()] ?? FALLBACK;
}

/** Status perangkat: nyala, mati, atau tidak dilaporkan. */
export function deviceStatus(device: {
  state?: Record<string, unknown> | null;
}): 'on' | 'off' | 'unknown' {
  const online = device.state?.online;
  if (online === false) return 'off';
  if (online === true) return 'on';
  return device.state?.power ? 'on' : 'off';
}

export function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
