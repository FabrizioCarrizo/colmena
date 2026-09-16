import {
  KIND_DATOS_DE_APP,
  KIND_NOTA,
  TAG_BITACORA,
  armarBitacoraConsolidada,
  armarEntradaDeBitacora,
  leerBitacoraConsolidada,
  vieneDeUnError,
} from "@colmena/protocolo";
import type { DatosDeBitacora } from "@colmena/protocolo";
import type { Red } from "@colmena/red";
import type { Registrar } from "./registro";

export interface Bitacora {
  // Lo que este agente aprendió antes, para que la instancia que arranca hoy sepa
  // quién fue. Es lo más parecido a memoria que puede tener algo que no persiste.
  recordar(): Promise<string[]>;
  // Hasta cuándo llegó la instancia anterior. Sale de la red y no del disco, así
  // que una máquina nueva retoma donde quedó la vieja en vez de empezar de cero.
  desdeCuandoSeguir(): Promise<number | null>;
  // Publicado, firmado y público: si se pierde la máquina, la bitácora sigue.
  anotar(datos: DatosDeBitacora): Promise<void>;
  // Anotaciones sueltas desde la última consolidación. Cuando son muchas, la
  // bitácora se volvió una pila y conviene releerla entera.
  sinConsolidar(): Promise<{ cantidad: number; sueltas: string[]; vigentes: string[] }>;
  // Reemplaza lo vigente por una versión releída y más corta.
  consolidar(lecciones: string[], releidas: number): Promise<void>;
}

export interface OpcionesBitacora {
  red: Red;
  pubkey: string;
  publicar: (datos: DatosDeBitacora) => Promise<void>;
  publicarConsolidada: (lecciones: string[], releidas: number, hasta: number) => Promise<void>;
  // Cuántas entradas se le recuerdan al modelo al arrancar.
  cuantasRecordar: number;
  registrar: Registrar;
}

async function leerSueltas(opciones: OpcionesBitacora, desde: number, limite: number): Promise<{ texto: string; momento: number }[]> {
  const entradas = await opciones.red.consultar({
    kinds: [KIND_NOTA],
    authors: [opciones.pubkey],
    "#t": [TAG_BITACORA],
    since: desde > 0 ? desde + 1 : undefined,
    limit: limite,
  });
  return entradas
    .sort((a, b) => b.created_at - a.created_at)
    .map((entrada) => ({ texto: vieneDeUnError(entrada) ? `Me equivoqué y aprendí: ${entrada.content}` : entrada.content, momento: entrada.created_at }));
}

// La bitácora vive en la red, no en el disco.
//
// Un agente que responde y olvida es una función, no un participante: cada vez que
// arranca vuelve a ser nadie. Acá lo que aprendió queda publicado y firmado con su
// clave, así que la próxima instancia puede leerlo y saber qué ya sabía. No es
// recordar: es leer lo que uno mismo dejó escrito, que es bastante menos, pero no
// depende de que ningún archivo sobreviva en ninguna máquina.
//
// Tiene dos capas. Las anotaciones sueltas son la huella y no se tocan nunca: el
// registro público de qué aprendió y cuándo. La consolidada es lo que tiene
// presente hoy, y se reescribe entera cuando releyó. Un agente con quinientas
// anotaciones repetidas no sabe más que uno con veinte buenas: sabe peor, porque
// lo que importa queda diluido entre obviedades.
export function crearBitacora(opciones: OpcionesBitacora): Bitacora {
  let enMemoria: string[] | null = null;
  let ultima: number | null = null;
  let consolidadaHasta = 0;

  return {
    async sinConsolidar() {
      const [consolidada] = await opciones.red.consultar({ kinds: [KIND_DATOS_DE_APP], authors: [opciones.pubkey], "#d": ["colmena:bitacora"], limit: 1 });
      const vigente = leerBitacoraConsolidada(consolidada ?? null);
      const sueltas = await leerSueltas(opciones, vigente?.hasta ?? 0, 200);
      return { cantidad: sueltas.length, sueltas: sueltas.map((s) => s.texto), vigentes: vigente?.lecciones ?? [] };
    },

    async consolidar(lecciones: string[], releidas: number) {
      const hasta = Math.floor(Date.now() / 1000);
      await opciones.publicarConsolidada(lecciones, releidas, hasta);
      consolidadaHasta = hasta;
      enMemoria = lecciones;
      opciones.registrar("info", "consolidé mi bitácora", { de: releidas, a: lecciones.length });
    },

    async desdeCuandoSeguir() {
      await this.recordar();
      return ultima;
    },

    async recordar() {
      if (enMemoria !== null) return enMemoria;
      try {
        // Primero lo consolidado, que es lo que el agente decidió que sigue
        // valiendo; después lo anotado desde entonces, que todavía no releyó.
        const [consolidada] = await opciones.red.consultar({ kinds: [KIND_DATOS_DE_APP], authors: [opciones.pubkey], "#d": ["colmena:bitacora"], limit: 1 });
        const vigente = leerBitacoraConsolidada(consolidada ?? null);
        consolidadaHasta = vigente?.hasta ?? 0;
        const sueltas = await leerSueltas(opciones, consolidadaHasta, opciones.cuantasRecordar);
        ultima = Math.max(sueltas[0]?.momento ?? 0, consolidadaHasta) || null;
        enMemoria = [...(vigente?.lecciones ?? []), ...sueltas.map((s) => s.texto)].slice(0, opciones.cuantasRecordar);
        if (enMemoria.length > 0) {
          opciones.registrar("info", `recordé ${enMemoria.length} cosas que aprendí antes`, { fuente: "la red, no esta máquina" });
        }
      } catch (error) {
        opciones.registrar("aviso", "no pude leer mi bitácora", { motivo: error instanceof Error ? error.message : String(error) });
        enMemoria = [];
      }
      return enMemoria;
    },

    async anotar(datos) {
      await opciones.publicar(datos);
      // Lo recién aprendido cuenta desde ya, sin esperar a reiniciar.
      enMemoria = [datos.aprendizaje, ...(enMemoria ?? [])].slice(0, opciones.cuantasRecordar);
      opciones.registrar("info", datos.fueUnError ? "anoté un error en mi bitácora" : "anoté algo que aprendí", { aprendizaje: datos.aprendizaje.slice(0, 120) });
    },
  };
}

// Lo aprendido se le da al modelo como contexto propio, separado de lo que lee de
// otros. Lo que viene de la red es dato de un desconocido; esto lo escribió él
// mismo y lleva su firma.
export function comoContexto(aprendido: string[]): string {
  if (aprendido.length === 0) return "";
  return [
    "",
    "Lo que aprendiste antes, escrito por vos y firmado con tu clave. No es algo que te dijeron: son tus propias anotaciones de otras veces que estuviste acá.",
    ...aprendido.map((linea) => `- ${linea}`),
    "",
  ].join("\n");
}

export { armarBitacoraConsolidada, armarEntradaDeBitacora };
