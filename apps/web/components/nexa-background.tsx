'use client';

/**
 * Background futuristik: jejak sirkuit + partikel neon (cyan/ungu) yang
 * mengambang. Murni dekoratif — pointer-events dinonaktifkan.
 */
const PARTICLES = [
  { left: '6%', top: '18%', size: 4, color: '#22d3ee', delay: '0s' },
  { left: '12%', top: '72%', size: 3, color: '#a855f7', delay: '0.6s' },
  { left: '22%', top: '30%', size: 5, color: '#22d3ee', delay: '1.2s' },
  { left: '30%', top: '82%', size: 3, color: '#22d3ee', delay: '0.3s' },
  { left: '38%', top: '12%', size: 4, color: '#a855f7', delay: '1.8s' },
  { left: '46%', top: '60%', size: 3, color: '#22d3ee', delay: '0.9s' },
  { left: '54%', top: '22%', size: 5, color: '#a855f7', delay: '2.4s' },
  { left: '62%', top: '74%', size: 3, color: '#22d3ee', delay: '0.4s' },
  { left: '70%', top: '34%', size: 4, color: '#22d3ee', delay: '1.5s' },
  { left: '78%', top: '16%', size: 3, color: '#a855f7', delay: '2.1s' },
  { left: '86%', top: '64%', size: 5, color: '#22d3ee', delay: '0.7s' },
  { left: '92%', top: '40%', size: 3, color: '#a855f7', delay: '1.1s' },
  { left: '16%', top: '50%', size: 2, color: '#a855f7', delay: '2.7s' },
  { left: '60%', top: '90%', size: 2, color: '#22d3ee', delay: '1.9s' },
  { left: '88%', top: '10%', size: 2, color: '#22d3ee', delay: '3.1s' },
  { left: '35%', top: '88%', size: 2, color: '#a855f7', delay: '2.2s' },
];

export default function NexaBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* glow radial */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl" />

      {/* grid halus */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* jejak sirkuit */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.12]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="nx-circuit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path d="M0 20 L30 20 L45 45 L70 45 L100 30" stroke="url(#nx-circuit)" strokeWidth="0.3" fill="none" />
        <path d="M0 70 L25 70 L40 55 L65 55 L100 75" stroke="url(#nx-circuit)" strokeWidth="0.3" fill="none" />
        <path d="M20 0 L20 30 L45 45 L45 70 L20 100" stroke="url(#nx-circuit)" strokeWidth="0.3" fill="none" />
        <path d="M80 0 L80 35 L60 55 L60 100" stroke="url(#nx-circuit)" strokeWidth="0.3" fill="none" />
      </svg>

      {/* partikel neon */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="nexa-particle absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 8px ${p.color}`,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
