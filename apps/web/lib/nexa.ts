import { api } from './api';

export type NexaState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'HAPPY'
  | 'CONFUSED'
  | 'WARNING'
  | 'ERROR'
  | 'SLEEPING'
  | 'EXCITED';

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
