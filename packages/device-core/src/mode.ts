/**
 * Validasi nilai mode integrasi yang datang dari environment.
 *
 * Tanpa validasi, salah ketik pada env (mis. `MQTT_MODE=live`) lolos tanpa
 * sengaja: adapter menganggap mode-nya "bukan mock dan bukan mode sungguhan",
 * sehingga `connect()` keluar diam-diam dan semua perintah perangkat gagal
 * tanpa penyebab yang jelas. `parseMode` menggagalkan startup lebih awal.
 *
 * Nama env dipakai di pesan error supaya mudah ditelusuri.
 */
export function parseMode<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  envName: string,
): T {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim() as T;
  if (!allowed.includes(normalized)) {
    throw new Error(
      `${envName}="${value}" tidak dikenal. Nilai yang didukung: ${allowed
        .map((mode) => `"${mode}"`)
        .join(', ')}.`,
    );
  }
  return normalized;
}
