import { api } from './api';
import { getToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export type NexaState =
  | 'IDLE' // Mode Standby
  | 'LISTENING' // Sedang Mendengarkan
  | 'THINKING' // Sedang Berpikir
  | 'PROCESSING' // Sedang Memproses
  | 'SUCCESS' // Perintah Berhasil
  | 'ERROR' // Terjadi Kesalahan
  | 'READY' // Sedang Siaga
  | 'SLEEPING'; // Mode Malam/Tidur

export interface NexaChatResponse {
  message: string;
  state: NexaState;
  tool?: { name: string; success: boolean };
  degraded?: 'llm_unavailable' | 'tool_failed';
}

/** Kemampuan Nexa saat ini (mode mock / STT belum siap). */
export interface NexaCapabilities {
  aiProvider: string;
  llm: 'mock' | 'live';
  tts: 'mock' | 'live';
  stt: { configured: boolean; engine: string };
  degraded: boolean;
}

/** Status kemampuan Nexa; null bila endpoint tidak tersedia (API lama). */
export async function fetchNexaStatus(): Promise<NexaCapabilities | null> {
  try {
    return await api<NexaCapabilities>('/nexa/status');
  } catch {
    return null;
  }
}

/** Kirim pesan ke Nexa dan terima balasan (state emosi + teks). */
export function sendNexaMessage(message: string): Promise<NexaChatResponse> {
  return api<NexaChatResponse>('/nexa/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

/** Voice feedback: coba TTS lewat backend; fallback ke speechSynthesis browser. */
export async function speakNexa(text: string): Promise<void> {
  try {
    const token = getToken();
    const res = await fetch(`${API_URL}/nexa/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && (await playAudio(URL.createObjectURL(blob)))) {
        return;
      }
    }
  } catch {
    /* jatuh ke fallback */
  }

  browserSpeak(text);
}

function playAudio(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    const settle = (ok: boolean) => {
      audio.onended = null;
      audio.onerror = null;
      resolve(ok);
    };
    audio.onended = () => settle(true);
    audio.onerror = () => settle(false);
    audio.play().catch(() => settle(false));
  });
}

function browserSpeak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'id-ID';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

/** Transkripsi audio (base64 WebM/Opus) via STT lokal di backend. */
export function transcribeAudio(audioBase64: string): Promise<string> {
  return api<{ text: string }>('/nexa/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audio: audioBase64 }),
  }).then((r) => r.text);
}

/** Buang kata panggil "Hi/Hai Nexa" di awal transkrip (wake word). */
export function stripWakeWord(text: string): string {
  return text
    .replace(/^\s*(hi|hai|hey|hei|halo)\s+nexa\b[,.!?\s]*/i, '')
    .trim();
}
