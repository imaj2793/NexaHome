'use client';

import type { ReactNode } from 'react';
import type { NexaState } from '@/lib/nexa';

interface NexaRobotProps {
  state: NexaState;
  message?: string;
  size?: 'sm' | 'xl';
}

interface RobotVisual {
  label: string;
  ring: string;
  glow: string;
  accent: string;
  headAnim: string;
}

/**
 * Visual robot Nexa (blueprint §15, §16, §40). Murni presentasional — hanya
 * menerima `state` + `message`, tidak tahu apa pun tentang AI Core. Ekspresi
 * mengikuti 8 state buatan user, lengkap dengan animasi per state.
 */
const VISUALS: Record<NexaState, RobotVisual> = {
  IDLE: { label: 'Mode Standby', ring: 'border-teal-400/50', glow: 'bg-teal-400', headAnim: 'nexa-bob', accent: 'text-teal-300' },
  LISTENING: { label: 'Sedang Mendengarkan', ring: 'border-cyan-400/60', glow: 'bg-cyan-400', headAnim: '', accent: 'text-cyan-300' },
  THINKING: { label: 'Sedang Berpikir', ring: 'border-sky-400/60', glow: 'bg-sky-400', headAnim: 'nexa-think', accent: 'text-sky-300' },
  PROCESSING: { label: 'Sedang Memproses', ring: 'border-cyan-400/60', glow: 'bg-cyan-400', headAnim: '', accent: 'text-cyan-300' },
  SUCCESS: { label: 'Perintah Berhasil', ring: 'border-emerald-400/60', glow: 'bg-emerald-400', headAnim: 'nexa-bounce', accent: 'text-emerald-300' },
  ERROR: { label: 'Terjadi Kesalahan', ring: 'border-red-500/60', glow: 'bg-red-500', headAnim: 'nexa-shake', accent: 'text-red-300' },
  READY: { label: 'Sedang Siaga', ring: 'border-sky-400/60', glow: 'bg-sky-400', headAnim: 'nexa-bob', accent: 'text-sky-300' },
  SLEEPING: { label: 'Mode Malam/Tidur', ring: 'border-teal-400/40', glow: 'bg-teal-400', headAnim: '', accent: 'text-teal-300' },
};

export default function NexaRobot({ state, message, size = 'sm' }: NexaRobotProps) {
  const v = VISUALS[state] ?? VISUALS.IDLE;

  const face = (
    <div className={`relative ${v.headAnim}`}>
      <div className={`absolute -inset-3 rounded-full ${v.glow} opacity-20 blur-lg`} />
      {badge(state)}
      <div
        className={`relative flex h-24 w-24 flex-col items-center justify-center gap-2.5 rounded-[2rem] border-2 ${v.ring} bg-gradient-to-b from-slate-800 to-slate-950`}
      >
        {/* mata */}
        <div className="flex items-center gap-3">{eyes(state)}</div>
        {/* mulut */}
        {mouth(state)}
      </div>
    </div>
  );

  if (size === 'xl') {
    return (
      <div className="flex flex-col items-center">
        <div className="flex h-80 items-center justify-center">
          <div style={{ transform: 'scale(3)' }}>{face}</div>
        </div>
        <span className={`text-2xl font-semibold uppercase tracking-wide ${v.accent}`}>
          {v.label}
        </span>
        {message && (
          <p className="mt-3 max-w-md text-center text-lg leading-relaxed text-slate-300">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      {face}
      <span className={`text-xs font-semibold uppercase tracking-wide ${v.accent}`}>
        {v.label}
      </span>
      {message && (
        <p className="line-clamp-2 max-w-[240px] text-center text-xs leading-relaxed text-slate-400">
          {message}
        </p>
      )}
    </div>
  );
}

// ── Mata per state ───────────────────────────────────────

function eyes(state: NexaState): ReactNode {
  switch (state) {
    case 'LISTENING':
      return (
        <>
          <span className="h-3 w-3 rounded-full bg-white ring-2 ring-cyan-300/50" />
          <span className="h-3 w-3 rounded-full bg-white ring-2 ring-cyan-300/50" />
        </>
      );
    case 'THINKING':
      return (
        <>
          <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-white" />
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </>
      );
    case 'PROCESSING':
      return (
        <>
          <span className="nexa-spin h-4 w-4 rounded-full border-2 border-cyan-300 border-t-transparent" />
          <span className="nexa-spin h-4 w-4 rounded-full border-2 border-cyan-300 border-t-transparent" />
        </>
      );
    case 'ERROR':
      return (
        <>
          <span className="text-base font-bold leading-none text-red-400">✕</span>
          <span className="text-base font-bold leading-none text-red-400">✕</span>
        </>
      );
    case 'SUCCESS':
      return (
        <>
          <span className="h-2 w-3.5 rounded-full border-b-2 border-emerald-200" />
          <span className="h-2 w-3.5 rounded-full border-b-2 border-emerald-200" />
        </>
      );
    case 'READY':
      return (
        <>
          <span className="h-2 w-3.5 rounded-full border-b-2 border-sky-200" />
          <span className="h-2 w-3.5 rounded-full border-b-2 border-sky-200" />
        </>
      );
    case 'SLEEPING':
      return (
        <>
          <span className="h-0.5 w-3 rounded-full bg-teal-200" />
          <span className="h-0.5 w-3 rounded-full bg-teal-200" />
        </>
      );
    case 'IDLE':
    default:
      return (
        <>
          <span className="h-2 w-3.5 rounded-full border-b-2 border-teal-200" />
          <span className="h-2 w-3.5 rounded-full border-b-2 border-teal-200" />
        </>
      );
  }
}

// ── Mulut per state ──────────────────────────────────────

function mouth(state: NexaState): ReactNode {
  switch (state) {
    case 'SUCCESS':
      return <span className="h-2.5 w-5 rounded-full border-b-2 border-emerald-200" />;
    case 'READY':
      return <span className="h-2.5 w-5 rounded-full border-b-2 border-sky-200" />;
    case 'IDLE':
      return <span className="h-2 w-4 rounded-full border-b-2 border-teal-200" />;
    case 'SLEEPING':
      return <span className="h-1.5 w-3 rounded-full border-b-2 border-teal-200" />;
    case 'THINKING':
      return <span className="h-2 w-4 rounded-full border-t-2 border-sky-200" />;
    case 'ERROR':
      return <span className="h-2 w-4 rounded-full border-t-2 border-red-300" />;
    case 'LISTENING':
    case 'PROCESSING':
    default:
      return null;
  }
}

// ── Badge / elemen di atas kepala per state ──────────────

function badge(state: NexaState): ReactNode {
  switch (state) {
    case 'SUCCESS':
      return (
        <span className="nexa-pop absolute -top-6 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow-[0_0_14px_rgba(16,185,129,0.6)]">
          ✓
        </span>
      );
    case 'ERROR':
      return (
        <span className="nexa-pop absolute -top-6 left-1/2 -translate-x-1/2 text-xl leading-none">
          ⚠️
        </span>
      );
    case 'READY':
      return (
        <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="nexa-dot h-1.5 w-1.5 rounded-full bg-sky-300"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      );
    case 'THINKING':
      return (
        <span className="nexa-float absolute -right-1 -top-3 text-xl font-bold text-sky-400">
          ?
        </span>
      );
    case 'LISTENING':
      return (
        <>
          <span className="absolute -left-4 top-1/2 flex -translate-y-1/2 flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="nexa-wave h-3 w-1 rounded-full bg-cyan-300"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
          <span className="absolute -right-4 top-1/2 flex -translate-y-1/2 flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="nexa-wave h-3 w-1 rounded-full bg-cyan-300"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
        </>
      );
    case 'SLEEPING':
      return (
        <span className="nexa-float absolute -right-7 -top-1 text-sm font-bold text-teal-300">
          z z z
        </span>
      );
    default:
      return null;
  }
}
