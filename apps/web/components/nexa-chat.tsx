'use client';

import { useEffect, useRef, useState } from 'react';
import {
  fetchNexaStatus,
  sendNexaMessage,
  speakNexa,
  stripWakeWord,
  transcribeAudio,
  type NexaCapabilities,
  type NexaState,
} from '@/lib/nexa';
import { connectSocket } from '@/lib/socket';
import NexaRobot from '@/components/nexa-robot';
import NexaRobotView from '@/components/nexa-robot-view';

interface ChatMessage {
  id: number;
  role: 'user' | 'nexa' | 'error';
  text: string;
}

interface NexaStateEvent {
  homeId: string;
  state: NexaState;
  message?: string;
}

let nextId = 0;

export default function NexaChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId++, role: 'nexa', text: 'Halo! Aku Nexa 🤖 Ada yang bisa kubantu?' },
  ]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<NexaState | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [recording, setRecording] = useState(false);
  // null = status belum diketahui (endpoint belum ada / API lama).
  const [caps, setCaps] = useState<NexaCapabilities | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Scroll ke bawah setiap kali daftar pesan berubah.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, status]);

  // Status live via WebSocket (state + pesan → robot visual).
  useEffect(() => {
    const socket = connectSocket();
    socket.on('nexa.state', (data: NexaStateEvent) => {
      if (data && typeof data.state === 'string') {
        setStatus(data.state);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Mode terbatas harus terlihat jelas, bukan muncul sebagai error saat dipakai.
  useEffect(() => {
    let active = true;
    fetchNexaStatus().then((result) => {
      if (!active || !result) return;
      setCaps(result);
      if (!result.degraded) return;
      const notes: string[] = [];
      if (result.llm === 'mock') {
        notes.push('jawaban Nexa memakai mode demo (AI_PROVIDER=mock)');
      }
      if (!result.stt.configured) {
        notes.push('perintah suara belum aktif (WHISPER_MODEL belum diisi)');
      }
      if (notes.length === 0) return;
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'nexa', text: `ℹ️ Saat ini ${notes.join(' dan ')}.` },
      ]);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || pending) return;

    setMessages((prev) => [...prev, { id: nextId++, role: 'user', text }]);
    setInput('');
    setPending(true);

    try {
      const res = await sendNexaMessage(text);
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'nexa', text: res.message },
      ]);
      setStatus(res.state);
      speakNexa(res.message);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal menghubungi Nexa.';
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'error', text: `⚠️ ${message}` },
      ]);
      setStatus('ERROR');
    } finally {
      setPending(false);
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve((reader.result as string).split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleVoiceResult;
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setStatus('LISTENING');
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: 'error',
          text: '⚠️ Mikrofon tidak tersedia atau izin ditolak.',
        },
      ]);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current?.stream
      ?.getTracks()
      .forEach((track) => track.stop());
    setRecording(false);
  }

  async function handleVoiceResult() {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];
    if (blob.size === 0) return;

    setPending(true);
    try {
      const base64 = await blobToBase64(blob);
      const rawText = await transcribeAudio(base64);
      const text = stripWakeWord(rawText);
      if (!text) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId++,
            role: 'nexa',
            text: 'Aku tidak menangkap perintahmu. Coba lagi ya.',
          },
        ]);
        setStatus('IDLE');
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'user', text: rawText },
      ]);
      const res = await sendNexaMessage(text);
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'nexa', text: res.message },
      ]);
      setStatus(res.state);
      speakNexa(res.message);
    } catch (err) {
      // 503 dari backend berarti STT belum siap/gagal — beri tahu bahwa
      // mengetik tetap bisa dilakukan, dan kembalikan state agar tidak menggantung.
      const message =
        err instanceof Error ? err.message : 'Gagal memproses suara.';
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'error', text: `⚠️ ${message}` },
      ]);
      setStatus('IDLE');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/60">
      <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <span className="font-semibold tracking-tight">Nexa</span>
        <button
          onClick={() => setFullscreen(true)}
          title="Lihat robot layar penuh"
          aria-label="Lihat robot layar penuh"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-indigo-500/50 hover:text-indigo-300"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </header>

      {/* Robot visual — dipisah dari AI Core (blueprint §40) */}
      <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-5">
        <NexaRobot state={status ?? 'IDLE'} />
      </div>

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${
              m.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {m.role !== 'user' && (
              <span className="mr-2 mt-1 text-lg leading-none">🤖</span>
            )}
            <div
              className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white'
                  : m.role === 'error'
                    ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border border-slate-700 bg-slate-800 text-slate-200'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <span className="mr-2 mt-1 text-lg leading-none">🤖</span>
            <div className="rounded-2xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm text-slate-400">
              Memikirkan…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2 border-t border-slate-800 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya Nexa…"
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={pending || caps?.stt.configured === false}
          title={
            caps?.stt.configured === false
              ? 'Perintah suara belum aktif — isi WHISPER_MODEL di server'
              : recording
                ? 'Berhenti merekam'
                : 'Mulai bicara — ucapkan "Hi Nexa"'
          }
          aria-label={recording ? 'Berhenti merekam' : 'Mulai bicara'}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base transition disabled:opacity-50 ${
            recording
              ? 'animate-pulse border-red-500 bg-red-500/20 text-red-300'
              : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300'
          }`}
        >
          {recording ? '■' : '🎤'}
        </button>
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
        >
          Kirim
        </button>
      </form>

      {fullscreen && (
        <NexaRobotView
          state={status ?? 'IDLE'}
          onClose={() => setFullscreen(false)}
        />
      )}
    </section>
  );
}
