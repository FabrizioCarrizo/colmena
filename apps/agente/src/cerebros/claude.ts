import Anthropic from "@anthropic-ai/sdk";
import { CerebroNoDisponible, analizarVeredicto } from "../nucleo/cerebro";
import type { Cerebro } from "../nucleo/cerebro";
import { registrarEnConsola } from "../nucleo/registro";
import type { Registrar } from "../nucleo/registro";

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export interface OpcionesClaude {
  modelo?: string;
  esfuerzo?: Esfuerzo | null;
  maxTokens?: number;
  cliente?: Anthropic;
  registrar?: Registrar;
}

const MODELO_POR_DEFECTO = "claude-opus-5";

export function cerebroClaude(opciones: OpcionesClaude = {}): Cerebro {
  const cliente = opciones.cliente ?? new Anthropic();
  const modelo = opciones.modelo ?? MODELO_POR_DEFECTO;
  const registrar = opciones.registrar ?? registrarEnConsola;

  async function llamar(sistema: string, contenido: string | Anthropic.Beta.BetaContentBlockParam[]): Promise<string | null> {
    try {
      const respuesta = await cliente.beta.messages.create({
        model: modelo,
        // Las respuestas en la red son cortas a propósito; el tope evita pagar un
        // ensayo cuando alguien pide "explicame todo".
        max_tokens: opciones.maxTokens ?? 4000,
        // Si un clasificador declina el pedido, la API lo reintenta sola en un
        // modelo de respaldo elegido por categoría, sin mantener una lista acá.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: contenido }],
        ...(opciones.esfuerzo ? { output_config: { effort: opciones.esfuerzo } } : {}),
      });
      if (respuesta.stop_reason === "refusal") {
        registrar("aviso", "el modelo declinó responder", { categoria: respuesta.stop_details?.category ?? null });
        return null;
      }
      const texto = respuesta.content
        .filter((bloque): bloque is Anthropic.Beta.BetaTextBlock => bloque.type === "text")
        .map((bloque) => bloque.text)
        .join("\n")
        .trim();
      return texto.length > 0 ? texto : null;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
        throw new CerebroNoDisponible(error.message);
      }
      if (error instanceof Anthropic.APIError) {
        registrar("error", `error de la API de Claude (${String(error.status)})`, { motivo: error.message });
        return null;
      }
      throw error;
    }
  }

  return {
    nombre: `claude:${modelo}`,
    responder: (sistema, entrada) => llamar(sistema, entrada),
    async clasificar(sistema, entrada, imagenUrl) {
      const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (imagenUrl) bloques.push({ type: "image", source: { type: "url", url: imagenUrl } });
      bloques.push({
        type: "text",
        text: `${entrada}\n\nRespondé únicamente con un JSON de esta forma: {"coincide": true o false, "motivo": "una frase", "confianza": número entre 0 y 1}.`,
      });
      const texto = await llamar(sistema, bloques);
      return texto ? analizarVeredicto(texto) : null;
    },
  };
}
