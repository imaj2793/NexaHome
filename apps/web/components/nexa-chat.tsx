'use client';

import { useEffect, useRef, useState } from 'react';
import { sendNexaMessage, speakNexa, type NexaState } from '@/lib/nexa';
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
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

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
        if (typeof data.message === 'string' && data.message) {
          setLastReply(data.message);
        }
      }
    });
    return () => {
      socket.disconnect();
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
      setLastReply(res.message);
      speakNexa(res.message);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal menghubungi Nexa.';
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'error', text: `⚠️ ${message}` },
      ]);
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
        <NexaRobot state={status ?? 'IDLE'} message={lastReply ?? undefined} />
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
          message={lastReply ?? undefined}
          onClose={() => setFullscreen(false)}
        />
      )}
    </section>
  );
}
