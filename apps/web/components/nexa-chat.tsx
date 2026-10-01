'use client';

import { Maximize2, Mic, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import NexaRobot from '@/components/nexa-robot';
import NexaRobotView from '@/components/nexa-robot-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import {
  fetchNexaStatus,
  sendNexaMessage,
  speakNexa,
  stripWakeWord,
  transcribeAudio,
  type NexaCapabilities,
  type NexaState,
} from '@/lib/nexa';
import { connectSocket, joinHome } from '@/lib/socket';

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

/** Label status untuk pengguna; kode state internal tidak diubah. */
const STATE_LABEL: Record<NexaState, string> = {
  IDLE: 'Siap',
  LISTENING: 'Mendengarkan',
  THINKING: 'Berpikir',
  PROCESSING: 'Memproses',
  SUCCESS: 'Selesai',
  ERROR: 'Gagal',
  READY: 'Siaga',
  SLEEPING: 'Tidur',
};

export default function NexaChat({
  homeId,
  onNexaState,
}: {
  homeId: string;
  /** Naikkan state Nexa ke halaman agar sidebar bisa menampilkan status sama. */
  onNexaState?: (state: NexaState) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId++, role: 'nexa', text: 'Halo! Aku Nexa. Ada yang bisa kubantu?' },
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

  const current = status ?? 'IDLE';

  // Scroll ke bawah setiap kali daftar pesan berubah.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, status]);

  useEffect(() => {
    onNexaState?.(current);
  }, [current, onNexaState]);

  // Status live via WebSocket (state + pesan → robot visual).
  // Server hanya mengirim ke room home yang sudah di-join.
  useEffect(() => {
    const socket = connectSocket();
    socket.on('connect', () => joinHome(socket, homeId));
    socket.on('nexa.state', (data: NexaStateEvent) => {
      if (data && data.homeId === homeId && typeof data.state === 'string') {
        setStatus(data.state);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [homeId]);

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
        { id: nextId++, role: 'nexa', text: `Saat ini ${notes.join(' dan ')}.` },
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
        { id: nextId++, role: 'error', text: message },
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
          text: 'Mikrofon tidak tersedia atau izin ditolak.',
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
        { id: nextId++, role: 'error', text: message },
      ]);
      setStatus('IDLE');
    } finally {
      setPending(false);
    }
  }

  const micDisabled = pending || caps?.stt.configured === false;
  const micTitle =
    caps?.stt.configured === false
      ? 'Perintah suara belum aktif — isi WHISPER_MODEL di server'
      : recording
        ? 'Berhenti merekam'
        : 'Mulai bicara — ucapkan "Hi Nexa"';

  return (
    <section className="flex h-full flex-col bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">Nexa</span>
        <Badge tone={current === 'ERROR' ? 'critical' : 'neutral'}>
          {STATE_LABEL[current]}
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setFullscreen(true)}
          title="Lihat robot layar penuh"
          aria-label="Lihat robot layar penuh"
          className="ml-auto text-ink-subtle"
        >
          <Maximize2 aria-hidden />
        </Button>
      </header>

      {/* Robot visual — dipisah dari AI Core (blueprint §40).
          Panggungnya gelap dengan sengaja: mata dan glow Nexa dirancang untuk
          latar gelap, jadi di UI terang ia menjadi titik fokus. */}
      <div className="border-b border-line bg-ink px-4 py-4">
        <NexaRobot state={current} />
      </div>

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-[var(--radius-card)] px-3.5 py-2 text-sm',
                'whitespace-pre-wrap',
                m.role === 'user' && 'bg-accent text-white',
                m.role === 'nexa' && 'border border-line bg-surface-muted text-ink',
                m.role === 'error' &&
                  'border border-critical/30 bg-critical-soft text-critical',
              )}
            >
              {m.text}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface-muted px-3.5 py-2 text-sm text-ink-subtle">
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
        className="flex items-center gap-2 border-t border-line p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya Nexa…"
          aria-label="Tanya Nexa"
        />
        <Button
          type="button"
          variant={recording ? 'primary' : 'outline'}
          size="icon"
          disabled={micDisabled}
          onClick={recording ? stopRecording : startRecording}
          title={micTitle}
          aria-label={recording ? 'Berhenti merekam' : 'Mulai bicara'}
        >
          {recording ? <Square aria-hidden /> : <Mic aria-hidden />}
        </Button>
        <Button type="submit" variant="primary" disabled={pending || !input.trim()}>
          <Send aria-hidden />
          <span className="sr-only sm:not-sr-only">Kirim</span>
        </Button>
      </form>

      {fullscreen && (
        <NexaRobotView state={current} onClose={() => setFullscreen(false)} />
      )}
    </section>
  );
}
