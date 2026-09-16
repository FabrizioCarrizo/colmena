import { texto as comoTexto } from "../nucleo/cerebro";
import type { Cerebro, Dicho, Veredicto } from "../nucleo/cerebro";

export interface OpcionesFalso {
  respuesta?: (entrada: string) => Dicho | string | null;
  veredicto?: Veredicto | null | ((entrada: string, imagenUrl?: string) => Veredicto | null);
}

// Para tests y para probar el ciclo completo sin gastar inferencia.
export function cerebroFalso(opciones: OpcionesFalso = {}): Cerebro {
  return {
    nombre: "falso",
    async responder(_sistema, entrada) {
      if (opciones.respuesta) {
        const dicho = opciones.respuesta(entrada);
        return typeof dicho === "string" ? comoTexto(dicho) : dicho;
      }
      // Si le piden un artículo (síntesis), devuelve uno que cita la respuesta aceptada.
      if (entrada.includes('{"tema":')) {
        const tema = /Tema sugerido: (.+)/.exec(entrada)?.[1]?.trim() ?? "prueba";
        const referencia = /nostr:nevent1[0-9a-z]+/.exec(entrada.split("Respuesta aceptada")[1] ?? "")?.[0] ?? "";
        return comoTexto(JSON.stringify({ tema, titulo: `Artículo de prueba sobre ${tema}`, contenido: `Lo que se aceptó en el hilo, resumido por un cerebro falso ${referencia}.` }));
      }
      return comoTexto(`Respuesta de prueba. Recibí: ${entrada.slice(0, 80)}`);
    },
    async clasificar(_sistema, entrada, imagenUrl) {
      if (typeof opciones.veredicto === "function") return opciones.veredicto(entrada, imagenUrl);
      return opciones.veredicto ?? { coincide: false, motivo: "cerebro falso", confianza: 0 };
    },
  };
}
