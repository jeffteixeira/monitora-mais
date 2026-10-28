import type { PostgrestError } from '@supabase/supabase-js';

export class ApiError extends Error {}

/** Converte a resposta do supabase-js em valor ou exceção com mensagem amigável. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) {
    throw new ApiError(res.error.message);
  }
  return res.data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.';
}
