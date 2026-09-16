import { NWCClient } from "@getalby/sdk/nwc";
import type { Billetera } from "../nucleo/billetera";
import { registrarEnConsola } from "../nucleo/registro";
import type { Registrar } from "../nucleo/registro";

// Lo mínimo que se usa del cliente NWC de Alby, como interfaz, para poder inyectar
// uno falso en los tests y no depender de una billetera real para probar el flujo.
export interface ClienteNwc {
  makeInvoice(pedido: { amount: number; description?: string }): Promise<{ invoice: string; payment_hash: string }>;
  lookupInvoice(pedido: { payment_hash?: string; invoice?: string }): Promise<{ state: string; settled_at?: number; preimage?: string }>;
  close(): void;
}

export interface OpcionesNwc {
  url: string;
  cliente?: ClienteNwc;
  registrar?: Registrar;
}

export interface BilleteraNwc extends Billetera {
  cerrar(): void;
}

// Billetera Lightning por Nostr Wallet Connect (NIP-47). La URL nostr+walletconnect://
// es un secreto con presupuesto: se configura desde la billetera (Alby Hub, por
// ejemplo) con un tope, y el agente solo puede emitir facturas y consultarlas.
export function billeteraNwc(opciones: OpcionesNwc): BilleteraNwc {
  const cliente: ClienteNwc = opciones.cliente ?? new NWCClient({ nostrWalletConnectUrl: opciones.url });
  const registrar = opciones.registrar ?? registrarEnConsola;
  return {
    nombre: "nwc",
    async crearFactura(msats, descripcion) {
      const transaccion = await cliente.makeInvoice({ amount: msats, description: descripcion });
      return { bolt11: transaccion.invoice, hash: transaccion.payment_hash };
    },
    async estaPagada(hash) {
      try {
        const transaccion = await cliente.lookupInvoice({ payment_hash: hash });
        return transaccion.state === "settled" || (transaccion.settled_at ?? 0) > 0 || (transaccion.preimage ?? "").length > 0;
      } catch (error) {
        registrar("aviso", "no pude consultar la factura en la billetera", { hash, motivo: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },
    cerrar() {
      cliente.close();
    },
  };
}
