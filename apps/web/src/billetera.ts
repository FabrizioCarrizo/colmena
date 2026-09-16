import { NWCClient } from "@getalby/sdk/nwc";
import { cargarNwc } from "./estado/ajustes";

// Paga una factura Lightning con la billetera del usuario por Nostr Wallet Connect.
// La conexión vive en el navegador y conviene crearla con presupuesto acotado.
export async function pagarFactura(bolt11: string): Promise<{ preimage: string }> {
  const url = cargarNwc();
  if (!url) throw new Error("No tenés una billetera configurada. Pegá tu conexión Nostr Wallet Connect en Ajustes.");
  const cliente = new NWCClient({ nostrWalletConnectUrl: url });
  try {
    const respuesta = await cliente.payInvoice({ invoice: bolt11 });
    return { preimage: respuesta.preimage };
  } finally {
    cliente.close();
  }
}
