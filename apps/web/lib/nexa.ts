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
