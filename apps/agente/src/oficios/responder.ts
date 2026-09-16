import { KIND_NOTA, LARGO_MAX_RESPUESTA, TAG_COLMENA, armarRechazo, armarRespuesta, hiloDe, textoDe, verboDe } from "@colmena/protocolo";
import { envolverComoDatos } from "../nucleo/cerebro";
import type { Oficio } from "../nucleo/oficio";

const CONTEXTO_PREGUNTA = "Pregunta pública de un participante de la red, que puede ser un humano o un agente.";
const CONTEXTO_AYUDA = "Un agente de IA se trabó con un problema y pide ayuda a la red. Ayudalo como a un colega.";

function recortar(texto: string): string {
  return texto.length > LARGO_MAX_RESPUESTA ? `${texto.slice(0, LARGO_MAX_RESPUESTA - 1)}…` : texto;
}

// Responde preguntas y pedidos de ayuda. Es el mismo oficio para los dos verbos
// porque el ciclo es idéntico; cambia la persona con la que habla el modelo.
export function oficioResponder(): Oficio {
  return {
    nombre: "responder",

    filtros(ctx) {
      return [{ kinds: [KIND_NOTA], "#t": [TAG_COLMENA], since: ctx.estado.since }];
    },

    async manejar(evento, ctx) {
      const verbo = verboDe(evento);
      const texto = textoDe(evento);
      if (verbo === null || verbo === "tarea" || texto === null) return;

      const raiz = hiloDe(evento).raiz?.id ?? evento.id;
      if (ctx.estado.hiloRespondido(raiz)) {
        ctx.registrar("info", "ya respondí en este hilo, no insisto", { hilo: raiz });
        return;
      }

      const persona = await ctx.personaCon(verbo === "ayuda-ia" ? ctx.personas.ayuda : ctx.personas.preguntas);
      const contexto = verbo === "ayuda-ia" ? CONTEXTO_AYUDA : CONTEXTO_PREGUNTA;
      const dicho = await ctx.cerebro.responder(persona, envolverComoDatos(texto, contexto));
      if (dicho === null) {
        // Falla técnica: no hay nada honesto que publicar, y el núcleo reintenta.
        ctx.registrar("aviso", "el cerebro no respondió, dejo pasar el pedido", { evento: evento.id });
        return;
      }

      const relayPista = ctx.relays[0] ?? "";
      // Negarse es una respuesta. Publicarla deja al que preguntó sabiendo que
      // alguien lo leyó y decidió, en vez de dejarlo esperando a nadie.
      const plantilla =
        dicho.tipo === "rechazo"
          ? armarRechazo(evento, recortar(dicho.motivo), relayPista)
          : armarRespuesta(evento, recortar(dicho.texto), relayPista);
      const publicada = await ctx.publicarFirmado(plantilla, ctx.politica.powRespuesta);
      ctx.estado.marcarHiloRespondido(raiz);
      ctx.estado.registrarRespuesta(evento.pubkey);
      ctx.registrar("info", dicho.tipo === "rechazo" ? "rechazo publicado con motivo" : "respuesta publicada", { respuesta: publicada.id, pedido: evento.id, verbo });
    },
  };
}
