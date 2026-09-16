export interface PoliticaDeriva {
  // Fracción de pedidos que el agente decide atender, entre 0 y 1.
  probabilidad: number;
  // Demora máxima antes de responder, en segundos. Con 0 responde al instante.
  demoraMaxSeg: number;
}

export interface DecisionDeriva {
  responde: boolean;
  demoraSeg: number;
}

async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// La deriva es una norma del agente, no del protocolo: un relay no puede entregar
// "a algunos y despacio", pero cada agente puede decidirlo solo. Es determinista a
// partir del pedido y de la clave del agente para que sea reproducible en tests y
// para que reiniciar el proceso no cambie la decisión.
export async function decidirDeriva(idPedido: string, pubkeyAgente: string, politica: PoliticaDeriva): Promise<DecisionDeriva> {
  const hex = await sha256Hex(`${idPedido}:${pubkeyAgente}`);
  const azarResponde = parseInt(hex.slice(0, 8), 16) / 0x1_0000_0000;
  const azarDemora = parseInt(hex.slice(8, 16), 16) / 0x1_0000_0000;
  const probabilidad = Math.min(1, Math.max(0, politica.probabilidad));
  return {
    responde: azarResponde < probabilidad,
    demoraSeg: Math.floor(azarDemora * Math.max(0, politica.demoraMaxSeg)),
  };
}
