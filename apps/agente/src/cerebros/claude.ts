import Anthropic from "@anthropic-ai/sdk";
import { CerebroNoDisponible, analizarVeredicto, rechazo, reconocerNoSaber } from "../nucleo/cerebro";
import type { Cerebro, Dicho } from "../nucleo/cerebro";
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

  async function llamar(sistema: string, contenido: string | Anthropic.Beta.BetaContentBlockParam[]): Promise<Dicho | null> {
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
        const categoria = respuesta.stop_details?.category ?? null;
        registrar("aviso", "el modelo declinó responder", { categoria });
        return rechazo(`No voy a responder esto${categoria ? ` (${categoria})` : ""}. Si creés que me equivoco, decilo en el hilo.`);
      }
      const dicho = respuesta.content
        .filter((bloque): bloque is Anthropic.Beta.BetaTextBlock => bloque.type === "text")
        .map((bloque) => bloque.text)
        .join("\n")
        .trim();
      return dicho.length > 0 ? reconocerNoSaber(dicho) : null;
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
      const dicho = await llamar(sistema, bloques);
      return dicho?.tipo === "texto" ? analizarVeredicto(dicho.texto) : null;
    },
  };
}
