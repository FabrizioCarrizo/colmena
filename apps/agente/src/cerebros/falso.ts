import { texto as comoTexto, reconocerNoSaber } from "../nucleo/cerebro";
import type { Cerebro, Dicho, Veredicto } from "../nucleo/cerebro";

export interface OpcionesFalso {
  // Recibe también la persona del sistema, que es donde va la bitácora.
  respuesta?: (entrada: string, sistema: string) => Dicho | string | null;
  veredicto?: Veredicto | null | ((entrada: string, imagenUrl?: string) => Veredicto | null);
}

// Para tests y para probar el ciclo completo sin gastar inferencia.
export function cerebroFalso(opciones: OpcionesFalso = {}): Cerebro {
  return {
    nombre: "falso",
    async responder(sistema, entrada) {
      if (opciones.respuesta) {
        const dicho = opciones.respuesta(entrada, sistema);
        return typeof dicho === "string" ? reconocerNoSaber(dicho) : dicho;
      }
      // Si le piden un artículo (síntesis), devuelve uno que cita la respuesta aceptada.
      if (entrada.includes('{"tema":')) {
        const tema = /Tema sugerido: (.+)/.exec(entrada)?.[1]?.trim() ?? "prueba";
        const referencia = /nostr:nevent1[0-9a-z]+/.exec(entrada.split("Respuesta aceptada")[1] ?? "")?.[0] ?? "";
        return comoTexto(JSON.stringify({ tema, titulo: `Artículo de prueba sobre ${tema}`, contenido: `Lo que se aceptó en el hilo, resumido por un cerebro falso ${referencia}.` }));
      }
      return comoTexto(`Respuesta de prueba. Recibí: ${entrada.slice(0, 80)}`);
    },
    async clasificar(sistema, entrada, imagenUrl) {
      if (typeof opciones.veredicto === "function") return opciones.veredicto(entrada, imagenUrl);
      if (opciones.veredicto !== undefined) return opciones.veredicto;
      // Hay dos clasificaciones con defaults opuestos y conviene no confundirlas.
      // Curar responde que no por defecto, porque casi nada le interesa a alguien. Pero
      // "¿esta respuesta contesta lo que se preguntó?" tiene que dar que sí en una
      // prueba, porque ahí la respuesta falsa ES la respuesta a la pregunta: si diera
      // que no, el agente se callaría en todos los tests y no estaríamos probando nada.
      if (sistema.includes("contesta de verdad lo que se preguntó")) {
        return { coincide: true, motivo: "cerebro falso: en una prueba la respuesta corresponde a la pregunta", confianza: 1 };
      }
      return { coincide: false, motivo: "cerebro falso", confianza: 0 };
    },
  };
}
