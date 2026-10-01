import { ApiError } from '../common/errors/api-error';
import { ErrorCode } from '../common/errors/error-codes';

/**
 * Filter akses rumah (spec §12).
 *
 * `HomeMember` dipakai untuk otorisasi: user bisa mengakses rumah yang ia
 * miliki **dan** rumah yang dianggotainya. Anggota punya kontrol penuh atas isi
 * rumah (device, room, command) — lihat `docs/authentication.md` — sedangkan
 * ubah/hapus rumah, kelola anggota, dan seluruh operasi integrasi tetap
 * milik pemilik saja lewat `assertOwner`.
 *
 * Fungsi ini dipakai sebagai filter `home:` di query Prisma mana pun, sehingga
 * menambah integration atau resource baru tidak akan meloloskan akses hanya
 * karena lupa menulis cek keanggotaan.
 */

/** Filter `Home` yang mencakup rumah milik user dan rumah yang dianggotainya. */
export function accessibleHomeFilter(userId: string): {
  OR: Array<Record<string, unknown>>;
} {
  return {
    OR: [{ ownerId: userId }, { members: { some: { userId } } }],
  };
}

/** Filter `Home` dengan homeId tertentu (untuk query per-id). */
export function accessibleHomeWhere(
  userId: string,
  homeId?: string,
): Record<string, unknown> {
  return {
    ...accessibleHomeFilter(userId),
    ...(homeId ? { id: homeId } : {}),
  };
}

/**
 * Aseguran user adalah pemilik (bukan sekadar anggota). Dipakai untuk operasi
 * yang mengubah rumah: ubah nama, hapus, kelola anggota.
 */
export function assertOwner(isOwner: boolean, homeId: string): void {
  if (isOwner) return;
  // 404, bukan 403: user biasa tidak boleh mengonfirmasi keberadaan rumah
  // yang bukan miliknya.
  throw new ApiError(
    ErrorCode.NOT_FOUND,
    'Home tidak ditemukan.',
    { homeId },
  );
}
