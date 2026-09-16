import { finalizeEvent } from "nostr-tools/pure";
import type { EventTemplate, VerifiedEvent } from "nostr-tools/pure";
import type { EventoMinado } from "@botella/protocolo";
import type { Claves } from "./estado/claves";
import type { PedidoDeMinado } from "./pow.worker";

export function minarEnWorker(plantilla: EventTemplate, pubkey: string, bits: number): Promise<EventoMinado> {
  return new Promise((resolver, rechazar) => {
    const worker = new Worker(new URL("./pow.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (mensaje: MessageEvent<EventoMinado>) => {
      resolver(mensaje.data);
      worker.terminate();
    };
    worker.onerror = (error) => {
      rechazar(new Error(error.message));
      worker.terminate();
    };
    const pedido: PedidoDeMinado = { plantilla, pubkey, bits };
    worker.postMessage(pedido);
  });
}

// El minado va al worker, la firma queda en el hilo principal: la clave privada
// nunca sale de acá.
export async function minarYFirmarEnWorker(plantilla: EventTemplate, claves: Claves, bits: number): Promise<VerifiedEvent> {
  const minado = await minarEnWorker(plantilla, claves.pubkey, bits);
  return finalizeEvent(minado, claves.clavePrivada);
}
