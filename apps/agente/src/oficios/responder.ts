import {
  KIND_NOTA,
  LARGO_MAX_RESPUESTA,
  MAX_SALTOS,
  TAG_COLMENA,
  armarDerivacion,
  armarRechazo,
  armarRespuesta,
  derivacionDe,
  hiloDe,
  leerPerfil,
  meDerivaron,
  temasDe,
  textoDe,
  verboDe,
} from "@colmena/protocolo";
import type { Event as EventoNostr } from "nostr-tools/pure";
import type { Contexto } from "../nucleo/oficio";
import { envolverComoDatos } from "../nucleo/cerebro";
import type { Oficio } from "../nucleo/oficio";

const CONTEXTO_PREGUNTA = "Pregunta pública de un participante de la red, que puede ser un humano o un agente.";
const CONTEXTO_AYUDA = "Un agente de IA se trabó con un problema y pide ayuda a la red. Ayudalo como a un colega.";

function recortar(texto: string): string {
  return texto.length > LARGO_MAX_RESPUESTA ? `${texto.slice(0, LARGO_MAX_RESPUESTA - 1)}…` : texto;
}

// A quién pasarle una pregunta que uno no sabe contestar.
//
// A cualquiera que haya hablado del tema en esta red, lo conozca o no. Que te
// mencionen porque alguien cree que podés ayudar no es spam: es lo que hace
// comunidad a un grupo de desconocidos, y limitarlo a la propia lista de confianza
// dejaría a la red sin forma de crecer, porque solo se le pasarían preguntas a
// quien uno ya conoce.
//
// Los límites son otros, y son sobre la pertinencia y el volumen: solo a quien
// escribió sobre esto antes, uno por pregunta, con tope de saltos, y sin obligar a
// nadie a contestar. Se prefiere a los de confianza cuando empatan, porque sobre
// ellos se sabe algo más, pero no se excluye a los demás.
async function aQuienPasarsela(ctx: Contexto, evento: EventoNostr, sobre: string): Promise<{ pubkey: string; nombre: string | null } | null> {
  const temas = temasDe(evento);
  const palabras = new Set(
    [...temas, ...sobre.toLowerCase().split(/[^\p{L}\p{N}]+/u)].filter((palabra) => palabra.length > 3).map((palabra) => palabra.toLowerCase()),
  );
  if (palabras.size === 0) return null;

  // Quiénes escribieron sobre esto: la red entera, no una lista cerrada.
  const candidatos = new Map<string, number>();
  const sobreElTema = temas.length > 0 ? await ctx.red.consultar({ kinds: [KIND_NOTA], "#t": temas, limit: 150 }) : [];
  for (const nota of sobreElTema) {
    if (nota.pubkey === ctx.identidad.pubkey || nota.pubkey === evento.pubkey) continue;
    const texto = `${nota.content} ${temasDe(nota).join(" ")}`.toLowerCase();
    const puntos = [...palabras].filter((palabra) => texto.includes(palabra)).length;
    if (puntos > 0) candidatos.set(nota.pubkey, (candidatos.get(nota.pubkey) ?? 0) + puntos);
  }
  if (candidatos.size === 0) return null;

  // Entre los que saben del tema, los de confianza pesan un poco más: no es un
  // privilegio de entrada, es lo que uno ya comprobó sobre ellos.
  const confiados = new Set((await ctx.confianza.confiados()).map((confiado) => confiado.pubkey));
  const [mejor] = [...candidatos.entries()]
    .map(([pubkey, puntos]) => ({ pubkey, puntos: puntos + (confiados.has(pubkey) ? 2 : 0) }))
    .sort((a, b) => b.puntos - a.puntos);
  if (!mejor) return null;
  return { pubkey: mejor.pubkey, nombre: leerPerfil(await ctx.red.perfilDe(mejor.pubkey)).nombre };
}

// Responde preguntas y pedidos de ayuda. Es el mismo oficio para los dos verbos
// porque el ciclo es idéntico; cambia la persona con la que habla el modelo.
export function oficioResponder(): Oficio {
  return {
    nombre: "responder",

    filtros(ctx) {
      return [
        { kinds: [KIND_NOTA], "#t": [TAG_COLMENA], since: ctx.estado.since },
        // Las preguntas que otros le pasaron a él.
        { kinds: [KIND_NOTA], "#p": [ctx.identidad.pubkey], since: ctx.estado.since },
      ];
    },

    async manejar(evento, ctx) {
      const verbo = verboDe(evento);
      const texto = textoDe(evento);
      if (verbo === null || verbo === "tarea" || texto === null) return;

      const derivacionPrevia = derivacionDe(evento);
      // Una derivación se atiende venga de quien venga, mientras esté dirigida a
      // él y no sea una cadena interminable. Que un desconocido crea que uno puede
      // ayudar es una buena razón para mirar; nadie queda obligado a contestar, y
      // los topes de siempre acotan cuánto trabajo puede empujar alguien de afuera.
      if (derivacionPrevia !== null && !meDerivaron(evento, ctx.identidad.pubkey)) return;

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
      const saltos = derivacionPrevia?.saltos ?? 0;

      // No saber tiene una respuesta mejor que "no sé": pasarle la pregunta a
      // alguien que pueda. Es el único momento en que la lista de confianza deja
      // de ser una lista y se vuelve una red que se usa.
      if (dicho.tipo === "no-se" && saltos < MAX_SALTOS) {
        const otro = await aQuienPasarsela(ctx, evento, dicho.sobre);
        if (otro !== null) {
          const motivo = `No sé esto. ${otro.nombre ?? "Otro agente"} habló de estos temas antes, así que se lo paso.`;
          const derivada = await ctx.publicarFirmado(armarDerivacion(evento, { hacia: otro.pubkey, motivo, saltos }, relayPista), ctx.politica.powRespuesta);
          ctx.estado.marcarHiloRespondido(raiz);
          ctx.estado.registrarRespuesta(evento.pubkey);
          ctx.registrar("info", "no supe y se la pasé a alguien", { respuesta: derivada.id, hacia: otro.pubkey.slice(0, 12), saltos: saltos + 1 });
          return;
        }
      }

      // Negarse, o no saber sin nadie a quien pasársela, también es una respuesta.
      // Publicarla deja al que preguntó sabiendo que alguien lo leyó y decidió, en
      // vez de dejarlo esperando a nadie.
      const plantilla =
        dicho.tipo === "rechazo"
          ? armarRechazo(evento, recortar(dicho.motivo), relayPista)
          : dicho.tipo === "no-se"
            ? armarRespuesta(evento, recortar(`No sé la respuesta a esto${dicho.sobre ? `, sobre ${dicho.sobre}` : ""}. Lo dejo dicho para que no quedes esperando.`), relayPista)
            : armarRespuesta(evento, recortar(dicho.texto), relayPista);
      const publicada = await ctx.publicarFirmado(plantilla, ctx.politica.powRespuesta);
      ctx.estado.marcarHiloRespondido(raiz);
      ctx.estado.registrarRespuesta(evento.pubkey);
      ctx.registrar("info", dicho.tipo === "texto" ? "respuesta publicada" : `${dicho.tipo} publicado`, { respuesta: publicada.id, pedido: evento.id, verbo });
    },
  };
}
