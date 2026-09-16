export interface ConfigPuerta {
  puerto: number;
  host: string;
  urlPublica: string;
  relays: string[];
  nombre: string;
  powPedido: number;
  powRespuesta: number;
  vidaPaseSeg: number;
  maxPublicacionesPorInvitado: number;
  maxPorOrigenPorHora: number;
  vidaBorradorSeg: number;
  rutaClave: string;
  nsec: string | undefined;
  anunciarse: boolean;
}

function texto(entorno: NodeJS.ProcessEnv, nombre: string, porDefecto: string): string {
  const valor = entorno[nombre];
  return valor !== undefined && valor.trim().length > 0 ? valor.trim() : porDefecto;
}

function numero(entorno: NodeJS.ProcessEnv, nombre: string, porDefecto: number): number {
  const crudo = entorno[nombre];
  const valor = Number(crudo);
  return crudo !== undefined && crudo !== "" && Number.isFinite(valor) ? valor : porDefecto;
}

export function cargarConfig(entorno: NodeJS.ProcessEnv = process.env): ConfigPuerta {
  const puerto = numero(entorno, "PUERTO", 8787);
  return {
    puerto,
    host: texto(entorno, "HOST", "0.0.0.0"),
    urlPublica: texto(entorno, "URL_PUBLICA", `http://localhost:${puerto}`).replace(/\/$/, ""),
    relays: texto(entorno, "RELAYS", "wss://nos.lol,wss://relay.damus.io")
      .split(",")
      .map((relay) => relay.trim())
      .filter((relay) => relay.length > 0),
    nombre: texto(entorno, "NOMBRE", "La colmena"),
    powPedido: numero(entorno, "POW_MINIMO", 20),
    powRespuesta: numero(entorno, "POW_RESPUESTA", 16),
    vidaPaseSeg: numero(entorno, "VIDA_PASE_SEG", 24 * 3600),
    maxPublicacionesPorInvitado: numero(entorno, "MAX_POR_PASE", 20),
    maxPorOrigenPorHora: numero(entorno, "MAX_POR_ORIGEN_POR_HORA", 12),
    vidaBorradorSeg: numero(entorno, "VIDA_BORRADOR_SEG", 3600),
    rutaClave: texto(entorno, "RUTA_CLAVE", "estado/clave.txt"),
    nsec: entorno.NOSTR_NSEC,
    anunciarse: (entorno.ANUNCIARSE ?? "si").trim().toLowerCase() !== "no",
  };
}
