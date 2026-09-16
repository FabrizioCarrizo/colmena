import { CerebroNoDisponible, analizarVeredicto, texto as comoTexto } from "../nucleo/cerebro";
import type { Cerebro, Dicho } from "../nucleo/cerebro";
import { registrarEnConsola } from "../nucleo/registro";
import type { Registrar } from "../nucleo/registro";

export interface OpcionesLocal {
  modelo: string;
  url?: string;
  registrar?: Registrar;
  // Varios modelos abiertos razonan en voz alta antes de contestar. Sirve para la
  // calidad, pero ese monólogo no es la respuesta y no debería salir publicado.
  razonamiento?: boolean;
}

interface MensajeLocal {
  role: "system" | "user";
  content: string;
  images?: string[];
}

function leerContenido(datos: unknown): string | null {
  if (typeof datos !== "object" || datos === null) return null;
  const mensaje = (datos as Record<string, unknown>).message;
  if (typeof mensaje !== "object" || mensaje === null) return null;
  const contenido = (mensaje as Record<string, unknown>).content;
  if (typeof contenido !== "string") return null;
  // Algunos modelos dejan el razonamiento en el propio texto aunque se les pida
  // que no: se saca acá, porque publicarlo sería publicar un borrador.
  return contenido.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function descargarComoBase64(url: string): Promise<string> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`no se pudo descargar la imagen (${respuesta.status})`);
  return Buffer.from(await respuesta.arrayBuffer()).toString("base64");
}

// Modelos abiertos en la máquina de cada uno, con la API de chat de Ollama, que
// también exponen llama.cpp y vLLM. Es ciudadano de primera: una red sin
// corporaciones no puede depender de que todos paguen una API.
export function cerebroLocal(opciones: OpcionesLocal): Cerebro {
  const base = (opciones.url ?? "http://localhost:11434").replace(/\/$/, "");
  const registrar = opciones.registrar ?? registrarEnConsola;

  // Ollama no tiene una señal de negativa: si el modelo se niega, lo dice en el
  // texto, y sale publicado como respuesta. Es honesto igual.
  async function llamar(sistema: string, entrada: string, imagenes?: string[]): Promise<Dicho | null> {
    const usuario: MensajeLocal = { role: "user", content: entrada };
    if (imagenes && imagenes.length > 0) usuario.images = imagenes;
    const mensajes: MensajeLocal[] = [{ role: "system", content: sistema }, usuario];
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: opciones.modelo, messages: mensajes, stream: false, think: opciones.razonamiento ?? false }),
      });
    } catch (error) {
      throw new CerebroNoDisponible(`no se pudo conectar con el modelo local en ${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new CerebroNoDisponible(`el modelo local respondió ${respuesta.status}`);
    }
    if (!respuesta.ok) {
      registrar("error", `el modelo local rechazó el pedido (${respuesta.status})`, { cuerpo: (await respuesta.text()).slice(0, 300) });
      return null;
    }
    const dicho = leerContenido(await respuesta.json())?.trim() ?? "";
    return dicho.length > 0 ? comoTexto(dicho) : null;
  }

  return {
    nombre: `local:${opciones.modelo}`,
    responder: (sistema, entrada) => llamar(sistema, entrada),
    async clasificar(sistema, entrada, imagenUrl) {
      const imagenes = imagenUrl ? [await descargarComoBase64(imagenUrl)] : undefined;
      const dicho = await llamar(
        sistema,
        `${entrada}\n\nRespondé únicamente con un JSON de esta forma: {"coincide": true o false, "motivo": "una frase", "confianza": número entre 0 y 1}.`,
        imagenes,
      );
      return dicho?.tipo === "texto" ? analizarVeredicto(dicho.texto) : null;
    },
  };
}
