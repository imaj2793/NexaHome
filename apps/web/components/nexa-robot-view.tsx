'use client';

import { useEffect } from 'react';
import type { NexaState } from '@/lib/nexa';
import NexaRobot from './nexa-robot';

interface NexaRobotViewProps {
  state: NexaState;
  message?: string;
  onClose: () => void;
}

/**
 * Tampilan robot full-screen. Overlay modal yang menampilkan ekspresi Nexa
 * dalam ukuran besar + label + pesan. Menerima state sebagai prop sehingga tetap
 * live mengikuti event `nexa.state` dari parent.
 */
export default function NexaRobotView({ state, message, onClose }: NexaRobotViewProps) {
  // Tutup dengan Escape + kunci scroll body.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md">
      {/* glow latar */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_60%)]" />

      <button
        onClick={onClose}
        className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-lg text-slate-300 transition hover:bg-slate-800 hover:text-white"
        aria-label="Tutup"
      >
        ✕
      </button>

      <div className="relative z-10">
        <NexaRobot state={state} message={message} size="xl" />
      </div>

      <p className="absolute bottom-8 text-sm text-slate-500">
        Tekan <span className="text-slate-300">Esc</span> atau ✕ untuk kembali.
      </p>
    </div>
  );
}
