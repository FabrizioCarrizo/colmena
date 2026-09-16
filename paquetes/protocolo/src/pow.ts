import { getPow, minePow } from "nostr-tools/nip13";
import { finalizeEvent, getEventHash, getPublicKey } from "nostr-tools/pure";
import type { EventTemplate, UnsignedEvent, VerifiedEvent } from "nostr-tools/pure";
import type { ConTags } from "./tags";

export type EventoMinado = UnsignedEvent & { id: string };

export function powDe(evento: { id: string }): number {
  return getPow(evento.id);
}

// NIP-13: el tercer campo del tag "nonce" es la dificultad que el autor se comprometió
// a alcanzar. Sin compromiso, un spammer podría reciclar eventos que por azar tienen
// ceros al principio, así que su ausencia se trata como "sin prueba de trabajo".
export function compromisoDe(evento: ConTags): number | null {
  const nonce = evento.tags.find((t) => t[0] === "nonce");
  if (!nonce) return null;
  const objetivo = Number(nonce[2]);
  return Number.isFinite(objetivo) ? objetivo : null;
}

// minePow muta el evento y le agrega el tag "nonce": se trabaja sobre una copia para
// que la plantilla original siga sirviendo (por ejemplo, para reintentar).
export function minarPow(plantilla: EventTemplate, pubkey: string, bits: number): EventoMinado {
  const sinFirmar: UnsignedEvent = {
    kind: plantilla.kind,
    content: plantilla.content,
    created_at: plantilla.created_at,
    tags: plantilla.tags.map((tag) => [...tag]),
    pubkey,
  };
  if (bits <= 0) return { ...sinFirmar, id: getEventHash(sinFirmar) };
  return minePow(sinFirmar, bits);
}

export function minarYFirmar(plantilla: EventTemplate, clavePrivada: Uint8Array, bits: number): VerifiedEvent {
  const minado = minarPow(plantilla, getPublicKey(clavePrivada), bits);
  return finalizeEvent(minado, clavePrivada);
}
