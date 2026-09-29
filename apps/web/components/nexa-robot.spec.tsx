import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NexaRobot from './nexa-robot';
import type { NexaState } from '@/lib/nexa';

const ALL_STATES: NexaState[] = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'PROCESSING',
  'SUCCESS',
  'ERROR',
  'READY',
  'SLEEPING',
];

/** Eye elements: each state tags its eyes with an animation/utility class. */
const EYES_SELECTOR =
  'span.nexa-blink, span.nexa-spin, span.nexa-flash, span.nexa-squeeze';

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

function renderRobot(state: NexaState) {
  const { container, ...rest } = render(<NexaRobot state={state} />);
  return {
    container,
    html: container.innerHTML,
    glow: () => container.querySelector('[class*="blur-lg"]'),
    eyes: () => container.querySelectorAll(EYES_SELECTOR),
    // The mouth is the last span carrying a border-b-2/border-t-2 class
    // (SUCCESS/READY eyes are also bottom-bordered and come first).
    mouth: () => {
      const all = container.querySelectorAll('span.border-b-2, span.border-t-2');
      return (all[all.length - 1] ?? null) as HTMLElement | null;
    },
    ...rest,
  };
}

afterEach(cleanup);

describe('NexaRobot', () => {
  it('renders all 8 states without crashing', () => {
    for (const state of ALL_STATES) {
      const { unmount } = render(<NexaRobot state={state} />);
      expect(unmount).not.toThrow();
    }
  });

  describe('glow colour', () => {
    it.each(ALL_STATES)('%s uses its mapped glow class', (state) => {
      expect(renderRobot(state).glow()).toHaveClass(GLOW[state]);
    });
  });

  describe('animation modifiers', () => {
    it.each(['IDLE', 'SLEEPING'] as NexaState[])('%s breathes (nexa-glow)', (state) => {
      expect(renderRobot(state).glow()).toHaveClass('nexa-glow');
    });

    it.each(['PROCESSING', 'SUCCESS', 'ERROR', 'READY'] as NexaState[])(
      '%s dims the halo instead of breathing',
      (state) => {
        const glow = renderRobot(state).glow();
        expect(glow).not.toHaveClass('nexa-glow');
        expect(glow).toHaveClass('opacity-20');
      },
    );

    it.each(['LISTENING', 'THINKING'] as NexaState[])('%s gazes (nexa-gaze)', (state) => {
      expect(renderRobot(state).container.querySelector('.nexa-gaze')).not.toBeNull();
    });

    it.each(['IDLE', 'PROCESSING', 'SUCCESS', 'ERROR', 'READY', 'SLEEPING'] as NexaState[])(
      '%s does not gaze',
      (state) => {
        expect(renderRobot(state).container.querySelector('.nexa-gaze')).toBeNull();
      },
    );
  });

  describe('expression', () => {
    it('IDLE: round blinking white eyes + teal smile, no badge', () => {
      const r = renderRobot('IDLE');
      expect(r.eyes()).toHaveLength(2);
      expect(r.container.querySelectorAll('.nexa-blink')).toHaveLength(2);
      expect(r.html).toContain('h-6 w-6 rounded-full bg-white');
      expect(r.mouth()).toHaveClass('h-3.5 w-7', 'rounded-full', 'border-b-2', 'border-teal-200');
    });

    it('LISTENING: cyan-ringed eyes + sound waves, no mouth', () => {
      const r = renderRobot('LISTENING');
      expect(r.eyes()).toHaveLength(2);
      expect(r.container.querySelectorAll('.nexa-wave')).toHaveLength(6);
      expect(r.html).toContain('ring-cyan-300/50');
      expect(r.mouth()).toBeNull();
    });

    it('THINKING: one lowered eye + floating "?" + sky frown', () => {
      const r = renderRobot('THINKING');
      expect(r.eyes()).toHaveLength(2);
      expect(r.container.querySelector('.nexa-float')?.textContent).toBe('?');
      expect(r.html).toContain('mt-2 h-5 w-5 rounded-full bg-white');
      expect(r.mouth()).toHaveClass('h-3 w-6', 'rounded-full', 'border-t-2', 'border-sky-200');
    });

    it('PROCESSING: two spinning rings, no mouth, no badge', () => {
      const r = renderRobot('PROCESSING');
      expect(r.eyes()).toHaveLength(2);
      expect(r.container.querySelectorAll('.nexa-spin')).toHaveLength(2);
      expect(r.html).toContain('border-t-transparent');
      expect(r.mouth()).toBeNull();
    });

    it('SUCCESS: check badge + squeezed happy eyes + emerald smile', () => {
      const r = renderRobot('SUCCESS');
      expect(screen.getByText('✓')).toBeInTheDocument();
      expect(r.container.querySelectorAll('.nexa-squeeze')).toHaveLength(2);
      expect(r.eyes()).toHaveLength(2);
      expect(r.mouth()).toHaveClass('h-4 w-8', 'rounded-full', 'border-b-2', 'border-emerald-200');
    });

    it('ERROR: warning badge + two flashing X eyes + red frown', () => {
      const r = renderRobot('ERROR');
      expect(screen.getByText('⚠️')).toBeInTheDocument();
      expect(screen.getAllByText('✕')).toHaveLength(2);
      expect(r.container.querySelectorAll('.nexa-flash')).toHaveLength(2);
      expect(r.mouth()).toHaveClass('h-3 w-6', 'rounded-full', 'border-t-2', 'border-red-300');
    });

    it('READY: five staggered dots + sky eyes + sky smile', () => {
      const r = renderRobot('READY');
      const dots = r.container.querySelectorAll('.nexa-dot');
      expect(dots).toHaveLength(5);
      expect(dots[0]).toHaveStyle({ animationDelay: '0s' });
      expect(dots[4]).toHaveStyle({ animationDelay: '0.6s' });
      expect(r.eyes()).toHaveLength(2);
      expect(r.html).toContain('bg-sky-100');
      expect(r.mouth()).toHaveClass('h-4 w-8', 'rounded-full', 'border-b-2', 'border-sky-200');
    });

    it('SLEEPING: three floating z, closed line eyes, small teal smile', () => {
      const r = renderRobot('SLEEPING');
      expect(screen.getAllByText('z')).toHaveLength(3);
      expect(r.eyes()).toHaveLength(0);
      expect(r.html).toContain('h-1 w-6 rounded-full bg-teal-200');
      expect(r.mouth()).toHaveClass('h-2.5 w-5', 'rounded-full', 'border-b-2', 'border-teal-200');
    });
  });

  describe('size', () => {
    it('sm (default) renders the face without a transform wrapper', () => {
      const r = renderRobot('IDLE');
      expect(r.container.querySelector('[style*="scale"]')).toBeNull();
    });

    it('xl scales the face 3.5x', () => {
      const { container } = render(<NexaRobot state="IDLE" size="xl" />);
      const scaled = container.querySelector('[style*="scale"]') as HTMLElement;
      expect(scaled).not.toBeNull();
      expect(scaled.style.transform).toBe('scale(3.5)');
    });
  });

  it('falls back to the IDLE glow for an unknown state', () => {
    const r = renderRobot('BOGUS' as NexaState);
    expect(r.glow()).toHaveClass('bg-teal-400');
    expect(r.eyes()).toHaveLength(2);
  });
});
