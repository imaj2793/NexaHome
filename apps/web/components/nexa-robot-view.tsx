'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { NexaState } from '@/lib/nexa';
import NexaRobot from './nexa-robot';

interface NexaRobotViewProps {
  state: NexaState;
  onClose: () => void;
}

/**
 * Tampilan robot full-screen.
 *
 * Latarnya gelap dengan sengaja — sama seperti panggung robot di panel Nexa:
 * mata dan glow dirancang untuk latar gelap, dan layar penuh ini adalah
 * momen "berbicara dengan Nexa", bukan panel pengaturan.
 */
export default function NexaRobotView({ state, onClose }: NexaRobotViewProps) {
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
    <div
      role="dialog"
      aria-label="Nexa"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/95 backdrop-blur-md"
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 grid size-10 place-items-center rounded-full border border-white/15 text-ink-inverse-muted transition hover:bg-white/10 hover:text-ink-inverse"
        aria-label="Tutup"
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="relative z-10">
        <NexaRobot state={state} size="xl" />
      </div>

      <p className="absolute bottom-8 text-sm text-ink-inverse-subtle">
        Tekan <span className="text-ink-inverse-muted">Esc</span> untuk kembali.
      </p>
    </div>
  );
}