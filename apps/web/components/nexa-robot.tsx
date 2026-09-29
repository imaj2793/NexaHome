'use client';

import type { ReactNode } from 'react';
import type { NexaState } from '@/lib/nexa';

interface NexaRobotProps {
  state: NexaState;
  size?: 'sm' | 'xl';
}

/** Warna glow per state (halo neon, tanpa kotak). */
const GLOW: Record<NexaState, string> = {
  IDLE: 'bg-teal-400',
  LISTENING: 'bg-cyan-400',
  THINKING: 'bg-sky-400',
  PROCESSING: 'bg-cyan-400',
  SUCCESS: 'bg-emerald-400',
  ERROR: 'bg-red-500',
  READY: 'bg-sky-400',
  SLEEPING: 'bg-teal-400',
};

export default function NexaRobot({ state, size = 'sm' }: NexaRobotProps) {
  const glow = GLOW[state] ?? GLOW.IDLE;
  const breathe = state === 'IDLE' || state === 'SLEEPING';
  const gaze = state === 'LISTENING' || state === 'THINKING';

  const face = (
    <div className="relative flex flex-col items-center justify-center gap-3">
      <div
        className={`absolute -inset-5 rounded-full ${glow} blur-lg ${breathe ? 'nexa-glow' : 'opacity-20'}`}
      />
      {badge(state)}
      <div className={`flex items-center gap-4 ${gaze ? 'nexa-gaze' : ''}`}>
        {eyes(state)}
      </div>
      {mouth(state)}
    </div>
  );

  if (size === 'xl') {
    return (
      <div className="flex items-center justify-center">
        <div style={{ transform: 'scale(3.5)' }}>{face}</div>
      </div>
    );
  }

  return face;
}

// ── Mata per state ───────────────────────────────────────

function eyes(state: NexaState): ReactNode {
  switch (state) {
    case 'LISTENING':
      return (
        <>
          <span className="nexa-blink h-6 w-6 rounded-full bg-white ring-2 ring-cyan-300/50" />
          <span className="nexa-blink h-6 w-6 rounded-full bg-white ring-2 ring-cyan-300/50" />
        </>
      );
    case 'THINKING':
      return (
        <>
          <span className="nexa-blink mt-2 h-5 w-5 rounded-full bg-white" />
          <span className="nexa-blink h-5 w-5 rounded-full bg-white" />
        </>
      );
    case 'PROCESSING':
      return (
        <>
          <span className="nexa-spin h-7 w-7 rounded-full border-2 border-cyan-300 border-t-transparent" />
          <span className="nexa-spin h-7 w-7 rounded-full border-2 border-cyan-300 border-t-transparent" />
        </>
      );
    case 'ERROR':
      return (
        <>
          <span className="nexa-flash text-3xl font-bold leading-none text-red-400">✕</span>
          <span className="nexa-flash text-3xl font-bold leading-none text-red-400">✕</span>
        </>
      );
    case 'SUCCESS':
      return (
        <>
          <span className="nexa-squeeze h-3 w-6 rounded-full border-b-2 border-emerald-200" />
          <span className="nexa-squeeze h-3 w-6 rounded-full border-b-2 border-emerald-200" />
        </>
      );
    case 'READY':
      return (
        <>
          <span className="nexa-blink h-5 w-5 rounded-full bg-sky-100" />
          <span className="nexa-blink h-5 w-5 rounded-full bg-sky-100" />
        </>
      );
    case 'SLEEPING':
      return (
        <>
          <span className="h-1 w-6 rounded-full bg-teal-200" />
          <span className="h-1 w-6 rounded-full bg-teal-200" />
        </>
      );
    case 'IDLE':
    default:
      return (
        <>
          <span className="nexa-blink h-6 w-6 rounded-full bg-white" />
          <span className="nexa-blink h-6 w-6 rounded-full bg-white" />
        </>
      );
  }
}

// ── Mulut per state ──────────────────────────────────────

function mouth(state: NexaState): ReactNode {
  switch (state) {
    case 'SUCCESS':
      return <span className="h-4 w-8 rounded-full border-b-2 border-emerald-200" />;
    case 'READY':
      return <span className="h-4 w-8 rounded-full border-b-2 border-sky-200" />;
    case 'IDLE':
      return <span className="h-3.5 w-7 rounded-full border-b-2 border-teal-200" />;
    case 'SLEEPING':
      return <span className="h-2.5 w-5 rounded-full border-b-2 border-teal-200" />;
    case 'THINKING':
      return <span className="h-3 w-6 rounded-full border-t-2 border-sky-200" />;
    case 'ERROR':
      return <span className="h-3 w-6 rounded-full border-t-2 border-red-300" />;
    case 'LISTENING':
    case 'PROCESSING':
    default:
      return null;
  }
}

// ── Badge / elemen di sekitar wajah per state ────────────

function badge(state: NexaState): ReactNode {
  switch (state) {
    case 'SUCCESS':
      return (
        <span className="nexa-pulse-soft absolute -top-8 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow-[0_0_16px_rgba(16,185,129,0.6)]">
          ✓
        </span>
      );
    case 'ERROR':
      return (
        <span className="nexa-pulse-soft absolute -top-8 left-1/2 -translate-x-1/2 text-2xl leading-none">
          ⚠️
        </span>
      );
    case 'READY':
      return (
        <span className="absolute -top-4 left-1/2 flex -translate-x-1/2 gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="nexa-dot h-2 w-2 rounded-full bg-sky-300"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      );
    case 'THINKING':
      return (
        <span className="nexa-float absolute -right-2 -top-4 text-2xl font-bold text-sky-400">
          ?
        </span>
      );
    case 'LISTENING':
      return (
        <>
          <span className="absolute -left-6 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="nexa-wave h-4 w-1.5 rounded-full bg-cyan-300"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
          <span className="absolute -right-6 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="nexa-wave h-4 w-1.5 rounded-full bg-cyan-300"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
        </>
      );
    case 'SLEEPING':
      return (
        <>
          <span className="nexa-zzz absolute -right-4 -top-1 text-base font-bold text-teal-300">z</span>
          <span className="nexa-zzz absolute -right-3 -top-1 text-base font-bold text-teal-300" style={{ animationDelay: '0.4s' }}>z</span>
          <span className="nexa-zzz absolute -right-2 -top-1 text-base font-bold text-teal-300" style={{ animationDelay: '0.8s' }}>z</span>
        </>
      );
    default:
      return null;
  }
}
