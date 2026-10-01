'use client';

import { Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import NexaRobot from '@/components/nexa-robot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type ApiUser } from '@/lib/api';
import { setSession } from '@/lib/auth';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

/**
 * Login dengan dua panel: kiri menjelaskan produk dan menampilkan Nexa,
 * kanan berisi formulir.
 *
 * Kontrol "ingat saya" dan "lupa password" sengaja tidak ada — keduanya tidak
 * melakukan apa pun di API sekarang, dan tombol yang tidak berfungsi lebih
 * buruk daripada tidak ada tombolnya.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@nexahome.local');
  const [password, setPassword] = useState('password123');
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
      setSession(res.accessToken, res.refreshToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel kiri: identitas produk. */}
      <section className="relative hidden overflow-hidden border-r border-line bg-surface-sunken lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(70%_55%_at_20%_15%,var(--color-accent-soft),transparent_70%)]"
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center overflow-hidden rounded-[var(--radius-control)] bg-ink">
            <NexaRobot state="IDLE" />
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            NexaHome
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Rumahmu, terhubung dan cerdas.
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            Kendali perangkat, aturan otomatis, dan Nexa AI dalam satu tempat.
            Semua data tetap di rumahmu sendiri.
          </p>

          <dl className="mt-8 grid gap-4">
            <Feature
              title="Nexa AI"
              body="Bicara seperti ke orang rumah — Nexa menerjemahkan perintah ke tool yang benar."
            />
            <Feature
              title="Integrasi terbuka"
              body="MQTT, Tasmota, dan Shelly lewat modul yang bisa ditambah tanpa mengubah core."
            />
            <Feature
              title="Lokal lebih dulu"
              body="Perubahan perangkat dikirim lewat event, bukan polling."
            />
          </dl>
        </div>

        <p className="relative text-xs text-ink-subtle">
          Your Home. Connected. Intelligent.
        </p>
      </section>

      {/* Panel kanan: formulir. */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-lg font-semibold tracking-tight">NexaHome</span>
            <p className="text-sm text-ink-muted">Rumahmu, terhubung dan cerdas.</p>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Masuk ke akunmu</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Gunakan email dan password yang terdaftar.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
                />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="nama@email.com"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? 'Sembunyikan password' : 'Tampilkan password'
                  }
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-subtle"
                >
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-[var(--radius-control)] bg-critical-soft px-3 py-2 text-sm text-critical"
              >
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2">
              {!loading && <LogIn aria-hidden />}
              Masuk
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-subtle">
            Belum punya akun? Didaftarkan oleh pemilik rumah pertama.
          </p>
        </div>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <dt className="text-sm font-medium">{title}</dt>
      <dd className="mt-0.5 text-sm text-ink-muted">{body}</dd>
    </div>
  );
}
