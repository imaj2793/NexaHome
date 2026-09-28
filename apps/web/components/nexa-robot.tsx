'use client';

import type { NexaState } from '@/lib/nexa';

interface NexaRobotProps {
  state: NexaState;
  message?: string;
}

interface RobotVisual {
  label: string;
  ring: string;
  glow: string;
  headAnim: string;
  accent: string;
}

/**
 * Visual robot Nexa (blueprint §15, §16, §40). Murni presentasional — hanya
 * menerima `state` + `message`, tidak tahu apa pun tentang AI Core. Ini adalah
 * pemisahan "visual engine" dari backend sehingga desain robot bisa diganti
 * tanpa menyentuh backend.
 */
const VISUALS: Record<NexaState, RobotVisual> = {
  IDLE: { label: 'Siaga', ring: 'border-indigo-500/40', glow: 'bg-indigo-500', headAnim: 'nexa-bob', accent: 'text-indigo-300' },
  LISTENING: { label: 'Mendengarkan', ring: 'border-teal-400/60', glow: 'bg-teal-400', headAnim: 'nexa-pulse', accent: 'text-teal-300' },
  THINKING: { label: 'Berpikir', ring: 'border-amber-400/60', glow: 'bg-amber-400', headAnim: 'nexa-think', accent: 'text-amber-300' },
  SPEAKING: { label: 'Berbicara', ring: 'border-indigo-400/60', glow: 'bg-indigo-400', headAnim: '', accent: 'text-indigo-300' },
  HAPPY: { label: 'Senang', ring: 'border-emerald-400/60', glow: 'bg-emerald-400', headAnim: 'nexa-bob', accent: 'text-emerald-300' },
  CONFUSED: { label: 'Bingung', ring: 'border-yellow-400/60', glow: 'bg-yellow-400', headAnim: '', accent: 'text-yellow-300' },
  WARNING: { label: 'Perhatian', ring: 'border-orange-400/60', glow: 'bg-orange-400', headAnim: 'nexa-shake', accent: 'text-orange-300' },
  ERROR: { label: 'Error', ring: 'border-red-500/60', glow: 'bg-red-500', headAnim: 'nexa-shake', accent: 'text-red-300' },
  SLEEPING: { label: 'Tidur', ring: 'border-slate-600/50', glow: 'bg-slate-500', headAnim: '', accent: 'text-slate-400' },
  EXCITED: { label: 'Semangat', ring: 'border-fuchsia-400/60', glow: 'bg-fuchsia-400', headAnim: 'nexa-excited', accent: 'text-fuchsia-300' },
};

export default function NexaRobot({ state, message }: NexaRobotProps) {
  const v = VISUALS[state] ?? VISUALS.IDLE;
  const happy = state === 'HAPPY' || state === 'EXCITED';
  const sleeping = state === 'SLEEPING';
  const listening = state === 'LISTENING';
  const talking = state === 'SPEAKING';
  const negative = state === 'ERROR' || state === 'WARNING';
  const confused = state === 'CONFUSED';

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className={`relative ${v.headAnim}`}>
        <div className={`absolute -inset-3 rounded-full ${v.glow} opacity-20 blur-lg`} />
        <div
          className={`relative flex h-24 w-24 flex-col items-center justify-center gap-2.5 rounded-[2rem] border-2 ${v.ring} bg-gradient-to-b from-slate-800 to-slate-950`}
        >
          {/* antena */}
          <div className="absolute -top-4 flex flex-col items-center">
            <div className={`h-3 w-0.5 ${v.glow}`} />
            <div className={`h-2 w-2 rounded-full ${v.glow}`} />
          </div>

          {/* mata */}
          <div className="flex gap-2.5">
            <div className={eye(happy, sleeping, negative, listening)} />
            <div className={eye(happy, sleeping, negative, listening)} />
          </div>

          {/* mulut */}
          {talking ? (
            <div className="flex items-center gap-1">
              <span className="nexa-mouth-talk h-3.5 w-1 rounded-full bg-white" />
              <span className="nexa-mouth-talk h-3.5 w-1 rounded-full bg-white [animation-delay:0.1s]" />
              <span className="nexa-mouth-talk h-3.5 w-1 rounded-full bg-white [animation-delay:0.2s]" />
            </div>
          ) : (
            <div className={mouth(happy, confused, negative, sleeping, listening)} />
          )}
        </div>
      </div>

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

function eye(
  happy: boolean,
  sleeping: boolean,
  negative: boolean,
  listening: boolean,
): string {
  if (sleeping) return 'h-1 w-3 rounded-full bg-slate-400';
  if (happy) return 'h-2 w-3 rounded-full border-b-2 border-white';
  if (negative) return 'h-3 w-3 rounded-full bg-red-400';
  if (listening) return 'h-3.5 w-3.5 rounded-full bg-white ring-2 ring-teal-300/60';
  return 'nexa-eye h-2.5 w-2.5 rounded-full bg-white';
}

function mouth(
  happy: boolean,
  confused: boolean,
  negative: boolean,
  sleeping: boolean,
  listening: boolean,
): string {
  if (sleeping) return 'h-0.5 w-4 rounded-full bg-slate-400';
  if (happy) return 'h-2.5 w-4 rounded-full border-b-2 border-white';
  if (confused) return 'h-2.5 w-3 rounded-full border-2 border-white';
  if (negative) return 'h-2 w-4 rounded-full border-t-2 border-white';
  if (listening) return 'h-2.5 w-2.5 rounded-full border-2 border-white';
  return 'h-0.5 w-4 rounded-full bg-white';
}
