import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Gabungkan class Tailwind.
 *
 * `clsx` menerima apa saja (string, array, objek), `twMerge` membuat class
 * utility yang saling menimpa saling menggantikan — tanpa itu,
 * `className="... px-4"` dari props dan `px-2` dari komponen akan saling
 * berebut dan hasil render bergantung urutan penulisan.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
