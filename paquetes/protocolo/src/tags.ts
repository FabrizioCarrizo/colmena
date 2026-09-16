import type { Verbo } from "./constantes";
import { KIND_NOTA, KIND_TAREA, TAG_COLMENA, VERBOS } from "./constantes";

export interface ConTags {
  tags: string[][];
}

export function valorDeTag(evento: ConTags, nombre: string): string | null {
  const tag = evento.tags.find((t) => t[0] === nombre);
  const valor = tag?.[1];
  return typeof valor === "string" ? valor : null;
}

export function valoresDeTag(evento: ConTags, nombre: string): string[] {
  const valores: string[] = [];
  for (const tag of evento.tags) {
    const valor = tag[1];
    if (tag[0] === nombre && typeof valor === "string") valores.push(valor);
  }
  return valores;
}

function esVerbo(valor: string): valor is Verbo {
  return (VERBOS as readonly string[]).includes(valor);
}

// Devuelve null cuando el evento no es un pedido abierto de la red. Un kind 1 sin
// verbo es una nota común y no nos concierne.
export function verboDe(evento: ConTags & { kind: number }): Verbo | null {
  for (const valor of valoresDeTag(evento, "t")) {
    if (!esVerbo(valor)) continue;
    if (evento.kind === KIND_NOTA && valor !== "tarea") return valor;
    if (evento.kind === KIND_TAREA && valor === "tarea") return valor;
  }
  return null;
}

export function temasDe(evento: ConTags): string[] {
  return valoresDeTag(evento, "t").filter((valor) => !esVerbo(valor) && valor !== TAG_COLMENA);
}

// Un pedido dirigido a esta red, y no una nota que por casualidad usa la misma palabra.
export function esDeLaColmena(evento: ConTags): boolean {
  return valoresDeTag(evento, "t").includes(TAG_COLMENA);
}

// En una nota el texto es el contenido; en un pedido NIP-90 va en el tag "i".
export function textoDe(evento: ConTags & { kind: number; content: string }): string | null {
  if (evento.kind === KIND_TAREA) {
    const entrada = evento.tags.find((t) => t[0] === "i" && (t[2] === "text" || t[2] === "prompt")) ?? evento.tags.find((t) => t[0] === "i");
    const valor = entrada?.[1];
    return typeof valor === "string" ? valor : null;
  }
  return evento.content;
}

export function vencimientoDe(evento: ConTags): number | null {
  const valor = valorDeTag(evento, "expiration");
  if (valor === null) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export interface Imeta {
  url: string;
  mime: string | null;
  sha256: string | null;
  alt: string | null;
  dimensiones: string | null;
}

// NIP-92/NIP-68: el tag "imeta" lleva pares "campo valor" en cada entrada.
export function imetaDe(evento: ConTags): Imeta | null {
  const imeta = evento.tags.find((t) => t[0] === "imeta");
  if (!imeta) return null;
  const campos = new Map<string, string>();
  for (const entrada of imeta.slice(1)) {
    const espacio = entrada.indexOf(" ");
    if (espacio > 0) campos.set(entrada.slice(0, espacio), entrada.slice(espacio + 1));
  }
  const url = campos.get("url");
  if (!url) return null;
  return { url, mime: campos.get("m") ?? null, sha256: campos.get("x") ?? null, alt: campos.get("alt") ?? null, dimensiones: campos.get("dim") ?? null };
}
