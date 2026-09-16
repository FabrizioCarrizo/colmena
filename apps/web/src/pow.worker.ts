import { minarPow } from "@colmena/protocolo";
import type { EventTemplate } from "nostr-tools/pure";

export interface PedidoDeMinado {
  plantilla: EventTemplate;
  pubkey: string;
  bits: number;
}

// minePow es sincrónico y a 20 bits tarda segundos: en el hilo principal
// congelaría la interfaz. El worker no necesita la clave privada, solo la pública.
self.onmessage = (mensaje: MessageEvent<PedidoDeMinado>) => {
  const { plantilla, pubkey, bits } = mensaje.data;
  self.postMessage(minarPow(plantilla, pubkey, bits));
};
