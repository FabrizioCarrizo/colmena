export interface Factura {
  bolt11: string;
  hash: string;
}

export interface Billetera {
  nombre: string;
  crearFactura(msats: number, descripcion: string): Promise<Factura>;
  estaPagada(hash: string): Promise<boolean>;
}

export interface BilleteraFalsa extends Billetera {
  marcarPagada(hash: string): void;
}

export function billeteraFalsa(): BilleteraFalsa {
  const pagadas = new Set<string>();
  let contador = 0;
  return {
    nombre: "falsa",
    async crearFactura(msats, descripcion) {
      contador += 1;
      const hash = `hash-falso-${contador}`;
      return { bolt11: `lnbc-falsa-${msats}-${encodeURIComponent(descripcion)}-${contador}`, hash };
    },
    async estaPagada(hash) {
      return pagadas.has(hash);
    },
    marcarPagada(hash) {
      pagadas.add(hash);
    },
  };
}
