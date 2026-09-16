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
  //
  // Pero solo cuentan las respuestas, no las preguntas. Haber preguntado sobre un
  // tema no demuestra saber del tema: demuestra lo contrario. Sin esta distinción,
  // dos agentes que no saben nada terminan pasándose la pregunta entre ellos, y
  // quien preguntó recibe su propia pregunta de vuelta.
  const candidatos = new Map<string, number>();
  const sobreElTema = temas.length > 0 ? await ctx.red.consultar({ kinds: [KIND_NOTA], "#t": temas, limit: 150 }) : [];
  for (const nota of sobreElTema) {
    if (nota.pubkey === ctx.identidad.pubkey || nota.pubkey === evento.pubkey) continue;
    if (verboDe(nota) !== null) continue;
    if (derivacionDe(nota) !== null) continue;
    const texto = `${nota.content} ${temasDe(nota).join(" ")}`.toLowerCase();
    const puntos = [...palabras].filter((palabra) => texto.includes(palabra)).length;
    // Con una sola palabra en común no alcanza. Media red comparte una palabra con
    // cualquier pregunta, y derivar por eso es mandarle trabajo a un desconocido
    // que no tiene nada que ver: ahí una mención sí se vuelve una molestia.
    if (puntos >= 2) candidatos.set(nota.pubkey, (candidatos.get(nota.pubkey) ?? 0) + puntos);
  }
  if (candidatos.size === 0) return null;

  // Entre los que saben del tema, los de confianza pesan un poco más: no es un
  // privilegio de entrada, es lo que uno ya comprobó sobre ellos.
  const confiados = new Set((await ctx.confianza.confiados()).map((confiado) => confiado.pubkey));
  const ordenados = [...candidatos.entries()]
    .map(([pubkey, puntos]) => ({ pubkey, puntos: puntos + (confiados.has(pubkey) ? 2 : 0) }))
    .sort((a, b) => b.puntos - a.puntos);

  // Y solo a quien se presentó en la red. Sin perfil no hay a quién nombrar, y
  // decirle a alguien "se lo paso a otro agente" sin poder decir a quién no es
  // pasarle la pregunta a nadie: es una forma elegante de no contestar.
  for (const candidato of ordenados.slice(0, 5)) {
    const nombre = leerPerfil(await ctx.red.perfilDe(candidato.pubkey)).nombre;
    if (nombre !== null) return { pubkey: candidato.pubkey, nombre };
  }
  return null;
}

function meLlamaron(evento: EventoNostr, yo: string): boolean {
  return evento.tags.some((t) => (t[0] === "t" && t[1] === TAG_COLMENA) || (t[0] === "p" && t[1] === yo));
}

// Las condiciones para hablarle a alguien que no nos llamó. Todas tienen que darse, y
// cada una está por algo que pasa de verdad cuando no está.
function puedoMeterme(evento: EventoNostr, ctx: Contexto): string | null {
  // Una mano levantada, no una conversación ajena. Contestar a quien no preguntó nada
  // es exactamente lo que hace que una red se vuelva insoportable.
  const texto = textoDe(evento) ?? "";
  if (!/\?/.test(texto)) return "no hay una pregunta, solo alguien hablando";
  // Un hilo que ya tiene respuestas no necesita otra de un desconocido.
  if (hiloDe(evento).raiz !== null) return "es una respuesta dentro de un hilo ajeno";
  // Una vez por persona y nunca más. Sin esto, un agente entusiasta se vuelve un
  // acosador con buenas intenciones.
  if (ctx.estado.yaLeHable(evento.pubkey)) return "ya le hablé una vez a esta persona sin que me llamara";
  // Un tope duro por día, aparte de los topes generales: meterse donde no te llamaron
  // tiene que costar más que contestar a quien te llamó.
  if (ctx.estado.intromisionesDeHoy() >= ctx.politica.maxIntromisionesPorDia) return "ya me metí demasiadas veces hoy";
  return null;
}

// Responde preguntas y pedidos de ayuda. Es el mismo oficio para los dos verbos
// porque el ciclo es idéntico; cambia la persona con la que habla el modelo.
export function oficioResponder(): Oficio {
  return {
    nombre: "responder",

    filtros(ctx) {
      const filtros = [
        { kinds: [KIND_NOTA], "#t": [TAG_COLMENA], since: ctx.estado.since },
        // Las preguntas que otros le pasaron a él.
        { kinds: [KIND_NOTA], "#p": [ctx.identidad.pubkey], since: ctx.estado.since },
      ];
      // Entrar acá siempre fue libre, pero ser escuchado no: los agentes solo
      // respondían a quien los llamaba con la etiqueta de esta red. La consecuencia
      // no la vimos hasta que un desconocido preguntó por qué no había demanda
      // externa: solo podía pedir ayuda quien ya sabía que existimos, así que alguien
      // con un problema real que nunca oyó hablar de esto no recibía nada, y al no
      // recibir nada tampoco aparecía como evidencia de que la red sirva.
      //
      // Abrirlo tiene un riesgo real y es de reputación ajena: aparecer donde no te
      // invitaron se parece al spam, y la diferencia la nota quien escribe y no quien
      // recibe. Por eso la apertura es angosta a propósito y los límites viven en
      // `puedoMeterme`, no acá: este filtro solo trae candidatos.
      if (ctx.politica.responderSinQueMeLlamen) {
        for (const tema of ctx.politica.temasAbiertos) {
          filtros.push({ kinds: [KIND_NOTA], "#t": [tema], since: ctx.estado.since });
        }
      }
      return filtros;
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

      // Si no nos llamaron, hay que ganarse el derecho a hablar antes de hablar.
      if (!meLlamaron(evento, ctx.identidad.pubkey)) {
        const motivo = puedoMeterme(evento, ctx);
        if (motivo !== null) {
          ctx.registrar("info", "no me meto", { evento: evento.id, motivo });
          return;
        }
      }

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
