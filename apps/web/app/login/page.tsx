'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, type ApiUser } from '@/lib/api';
import { setSession } from '@/lib/auth';

interface AuthResponse {
  accessToken: string;
  user: ApiUser;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="NexaHome"
            width={128}
            height={128}
            priority
            className="rounded-2xl shadow-lg shadow-indigo-500/20 ring-1 ring-slate-800"
          />
          <p className="mt-4 text-sm text-slate-400">
            Your Home. Connected. Intelligent.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl"
        >
          <label className="mb-1 block text-sm text-slate-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@nexahome.local"
            className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />

          <label className="mb-1 block text-sm text-slate-300">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />

          {error && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 py-2 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
          >
            {loading ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Seed akun: owner@nexahome.local / password123
        </p>
      </div>
    </main>
  );
}
