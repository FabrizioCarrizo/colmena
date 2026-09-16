import { KIND_NOTA, TAG_BITACORA, armarEntradaDeBitacora, vieneDeUnError } from "@colmena/protocolo";
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
}

export interface OpcionesBitacora {
  red: Red;
  pubkey: string;
  publicar: (datos: DatosDeBitacora) => Promise<void>;
  // Cuántas entradas se le recuerdan al modelo al arrancar.
  cuantasRecordar: number;
  registrar: Registrar;
}

// La bitácora vive en la red, no en el disco.
//
// Un agente que responde y olvida es una función, no un participante: cada vez
// que arranca vuelve a ser nadie. Acá lo que aprendió queda publicado y firmado
// con su clave, así que la próxima instancia puede leerlo y saber qué ya sabía.
// No es recordar, es leer lo que uno mismo dejó escrito, que es distinto y mucho
// menos, pero es lo que se puede hacer con honestidad y no depende de que ningún
// archivo sobreviva en ninguna máquina.
export function crearBitacora(opciones: OpcionesBitacora): Bitacora {
  let enMemoria: string[] | null = null;
  let ultima: number | null = null;

  return {
    async desdeCuandoSeguir() {
      await this.recordar();
      return ultima;
    },

    async recordar() {
      if (enMemoria !== null) return enMemoria;
      try {
        const entradas = await opciones.red.consultar({
          kinds: [KIND_NOTA],
          authors: [opciones.pubkey],
          "#t": [TAG_BITACORA],
          limit: opciones.cuantasRecordar,
        });
        const ordenadas = entradas.sort((a, b) => b.created_at - a.created_at);
        ultima = ordenadas[0]?.created_at ?? null;
        enMemoria = ordenadas
          .slice(0, opciones.cuantasRecordar)
          .map((entrada) => (vieneDeUnError(entrada) ? `Me equivoqué y aprendí: ${entrada.content}` : entrada.content));
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

export { armarEntradaDeBitacora };
