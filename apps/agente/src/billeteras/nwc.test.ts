import { describe, expect, it } from "vitest";
import { billeteraNwc } from "./nwc";
import type { ClienteNwc } from "./nwc";

function clienteFalso(estadoFactura: string): ClienteNwc & { pedidos: unknown[] } {
  const pedidos: unknown[] = [];
  return {
    pedidos,
    async makeInvoice(pedido) {
      pedidos.push(pedido);
      return { invoice: `lnbc${pedido.amount}`, payment_hash: "hash-1" };
    },
    async lookupInvoice(pedido) {
      pedidos.push(pedido);
      if (pedido.payment_hash === "rota") throw new Error("not found");
      return { state: estadoFactura };
    },
    close() {
      pedidos.push("cerrado");
    },
  };
}

describe("billetera NWC", () => {
  it("emite facturas en milisatoshis y detecta el pago por el estado de la transacción", async () => {
    const cliente = clienteFalso("settled");
    const billetera = billeteraNwc({ url: "nostr+walletconnect://prueba", cliente, registrar: () => {} });
    expect(await billetera.crearFactura(21000, "Entrega")).toEqual({ bolt11: "lnbc21000", hash: "hash-1" });
    expect(cliente.pedidos[0]).toEqual({ amount: 21000, description: "Entrega" });
    expect(await billetera.estaPagada("hash-1")).toBe(true);
    billetera.cerrar();
    expect(cliente.pedidos.at(-1)).toBe("cerrado");
  });

  it("una factura pendiente o inconsultable cuenta como impaga", async () => {
    const billetera = billeteraNwc({ url: "nostr+walletconnect://prueba", cliente: clienteFalso("pending"), registrar: () => {} });
    expect(await billetera.estaPagada("hash-1")).toBe(false);
    expect(await billetera.estaPagada("rota")).toBe(false);
  });
});
