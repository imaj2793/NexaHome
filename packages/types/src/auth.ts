import { z } from 'zod';

/** Peran pengguna di dalam NexaHome (blueprint §24). */
export const RoleSchema = z.enum(['OWNER', 'ADMIN', 'USER']);
export type Role = z.infer<typeof RoleSchema>;

/** Entitas pengguna yang aman dikirim ke client (tanpa password hash). */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RegisterInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}
