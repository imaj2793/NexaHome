'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, type ApiUser } from '@/lib/api';
import { setSession } from '@/lib/auth';
import NexaBackground from '@/components/nexa-background';

interface AuthResponse {
  accessToken: string;
  user: ApiUser;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@nexahome.local');
  const [password, setPassword] = useState('password123');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <NexaBackground />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo + judul */}
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="NexaHome"
            width={72}
            height={72}
            priority
            className="rounded-2xl shadow-[0_0_30px_rgba(34,211,238,0.25)]"
          />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            NexaHome
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your Home. Connected. Intelligent.
          </p>
        </div>

        {/* Kartu glassmorphism dengan border gradasi */}
        <div className="rounded-3xl bg-gradient-to-r from-cyan-500/50 via-indigo-500/40 to-purple-500/50 p-px shadow-[0_0_50px_rgba(99,102,241,0.18)]">
          <form
            onSubmit={handleSubmit}
            className="rounded-[calc(1.5rem-1px)] bg-slate-950/70 p-6 backdrop-blur-xl"
          >
            <label className="mb-1 block text-sm text-slate-300">Email</label>
            <div className="relative mb-4">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500"
              />
            </div>

            <label className="mb-1 block text-sm text-slate-300">Password</label>
            <div className="relative mb-5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 py-2.5 pl-10 pr-10 text-sm text-slate-200 outline-none transition focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>

            {/* opsi */}
            <div className="mb-5 flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-400">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-cyan-500"
                />
                Remember Me
              </label>
              <button type="button" className="text-cyan-400 transition hover:text-cyan-300">
                Lupa Password?
              </button>
            </div>

            {error && (
              <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(34,211,238,0.25)] transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
