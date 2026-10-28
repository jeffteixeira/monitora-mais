/** Aceita só caminhos internos (evita open redirect via `?redirect=`). */
export function safeRedirect(url: string | undefined | null): string | null {
  return url && /^\/(?![/\\])/.test(url) ? url : null;
}
