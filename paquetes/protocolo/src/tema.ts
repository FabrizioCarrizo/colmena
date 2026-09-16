// NIP-54: el identificador de un tema se normaliza para que "Arte Indígena" y
// "arte-indígena" apunten al mismo artículo. Se preservan las letras no ASCII a
// propósito: la red es global y un tema en japonés o en guaraní tiene que poder
// existir tal cual, sin transliterarlo.
export function normalizarTema(tema: string): string {
  return tema
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
