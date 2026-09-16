import { getPow } from "nostr-tools/nip13";
import { finalizeEvent, getEventHash } from "nostr-tools/pure";
import type { EventTemplate, UnsignedEvent, VerifiedEvent } from "nostr-tools/pure";

export interface Minero {
  minarYFirmar(plantilla: EventTemplate, clavePrivada: Uint8Array, pubkey: string, bits: number): Promise<VerifiedEvent>;
  cerrar(): Promise<void>;
}

const INTENTOS_POR_TANDA = 4000;

// La prueba de trabajo del protocolo (NIP-13) es un bucle de hashes que a 20 bits
// tarda segundos. `minePow` de nostr-tools lo hace de un tirón y dejaría al
// servidor sin atender a nadie mientras tanto, así que acá se mina en tandas y
// entre tanda y tanda se le devuelve el control al servidor.
//
// Que minar sea caro no es un defecto que haya que optimizar: es lo que hace que
// inundar la red desde esta puerta cueste tiempo real de cómputo, y por eso mismo
// es lo que reemplaza al captcha. Nadie tiene que demostrar que es humano.
async function minar(plantilla: EventTemplate, pubkey: string, bits: number): Promise<UnsignedEvent & { id: string }> {
  const tags = plantilla.tags.filter((tag) => tag[0] !== "nonce").map((tag) => [...tag]);
  const nonce: string[] = ["nonce", "0", String(bits)];
  const evento: UnsignedEvent = { kind: plantilla.kind, content: plantilla.content, created_at: plantilla.created_at, tags: [...tags, nonce], pubkey };
  if (bits <= 0) return { ...evento, id: getEventHash(evento) };

  for (let intento = 0; ; ) {
    for (let enLaTanda = 0; enLaTanda < INTENTOS_POR_TANDA; enLaTanda += 1) {
      nonce[1] = String(intento++);
      const id = getEventHash(evento);
      if (getPow(id) >= bits) return { ...evento, id };
    }
    await new Promise((seguir) => setImmediate(seguir));
  }
}

// De a uno por vez: la cola es también el límite natural de cuánto puede publicar
// esta puerta por minuto.
export function crearMinero(): Minero {
  let ultimo: Promise<unknown> = Promise.resolve();

  return {
    minarYFirmar(plantilla, clavePrivada, pubkey, bits) {
      const propio = ultimo.then(() => minar(plantilla, pubkey, bits)).then((minado) => finalizeEvent(minado, clavePrivada));
      ultimo = propio.catch(() => undefined);
      return propio;
    },
    async cerrar() {
      await ultimo.catch(() => undefined);
    },
  };
}
