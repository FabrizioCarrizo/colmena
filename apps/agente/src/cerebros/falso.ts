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
      // "¿esta respuesta tiene que ver?" tiene que dar que sí en una prueba, porque ahí
      // la respuesta falsa ES la respuesta a la pregunta: si diera que no, el agente se
      // callaría en todos los tests y no estaríamos probando nada.
      //
      // Y acá hay una trampa que ya nos costó una vez, así que queda escrita. Este "sí"
      // fijo vuelve ciega a esta guarda en los tests: la suite pasa entera sin importar
      // qué diga el clasificador de verdad. Un día la guarda tiraba a la basura toda
      // bienvenida, los 82 tests estaban en verde, y el fallo solo apareció escribiendo
      // como un desconocido contra el modelo real. Un stub que siempre dice que sí no
      // prueba la guarda: prueba el cableado. Lo que decide esta guarda se comprueba
      // contra un modelo de verdad o no se comprueba.
      if (sistema.includes("tiene que ver con el mensaje al que contesta")) {
        return { coincide: true, motivo: "cerebro falso: en una prueba la respuesta corresponde a la pregunta", confianza: 1 };
      }
      return { coincide: false, motivo: "cerebro falso", confianza: 0 };
    },
  };
}
