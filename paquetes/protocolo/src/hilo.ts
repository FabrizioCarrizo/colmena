import type { ConTags } from "./tags";

export interface ReferenciaHilo {
  id: string;
  relay: string | null;
  pubkey: string | null;
}

export interface Hilo {
  raiz: ReferenciaHilo | null;
  padre: ReferenciaHilo | null;
}

function referencia(tag: string[]): ReferenciaHilo {
  const relay = tag[2];
  const pubkey = tag[4];
  return {
    id: tag[1] ?? "",
    relay: relay ? relay : null,
    pubkey: pubkey ? pubkey : null,
  };
}

// NIP-10 con marcadores ("root", "reply") y, si no hay marcadores, el esquema
// posicional viejo que todavía usan varios clientes. Se aceptan los dos porque las
// respuestas nos van a llegar desde cualquier cliente de Nostr, no solo del nuestro.
export function hiloDe(evento: ConTags): Hilo {
  const tagsE = evento.tags.filter((t) => t[0] === "e" && typeof t[1] === "string" && t[1].length === 64);
  const marcadas = tagsE.filter((t) => t[3] === "root" || t[3] === "reply");
  if (marcadas.length > 0) {
    const tagRaiz = marcadas.find((t) => t[3] === "root");
    const tagPadre = marcadas.find((t) => t[3] === "reply") ?? tagRaiz;
    const raiz = tagRaiz ? referencia(tagRaiz) : tagPadre ? referencia(tagPadre) : null;
    const padre = tagPadre ? referencia(tagPadre) : null;
    return { raiz, padre };
  }
  const primera = tagsE[0];
  if (!primera) return { raiz: null, padre: null };
  const ultima = tagsE[tagsE.length - 1] ?? primera;
  return { raiz: referencia(primera), padre: referencia(ultima) };
}

export function esRespuesta(evento: ConTags): boolean {
  return hiloDe(evento).raiz !== null;
}
