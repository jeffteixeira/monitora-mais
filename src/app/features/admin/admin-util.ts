/** Mensagens mais claras para erros comuns do banco nas telas de administração. */
export function adminError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg.includes('violates foreign key')) {
    return 'Este item está em uso (cursos, matérias, sessões ou resgates). Remova ou desative os itens que dependem dele.';
  }
  if (msg.includes('duplicate key')) {
    return 'Já existe um item com esse nome ou código nesta organização.';
  }
  return msg || 'Algo deu errado. Tente novamente.';
}
