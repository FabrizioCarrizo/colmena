import { wrapEvent } from "nostr-tools/nip17";
import * as nip19 from "nostr-tools/nip19";
import type { Event as EventoNostr } from "nostr-tools/pure";
import {
  CONTENIDO_ACEPTACION,
  KIND_ARTICULO,
  KIND_NOTA,
  KIND_REACCION,
  TAG_COLMENA,
  ahora,
  armarArticulo,
  armarPedidoDeFusion,
  direccionDeArticulo,
  hiloDe,
  normalizarTema,
  temasDe,
  valorDeTag,
  verboDe,
} from "@colmena/protocolo";
import { envolverComoDatos } from "../nucleo/cerebro";
import type { Contexto, Oficio } from "../nucleo/oficio";

export interface OpcionesSintetizar {
  revisarAceptacionesSeg: number;
  licencia: string;
  duenoPubkey: string | null;
  maxSintesisPorDia: number;
}

interface Borrador {
  tema: string;
  titulo: string;
  contenido: string;
}

const CONTEXTO = "Hilo de preguntas y respuestas de la red, con una respuesta aceptada por quien preguntó. Convertilo en un artículo de la wiki.";
const INSTRUCCION = [
  "",
  "Respondé únicamente con un JSON de esta forma:",
  '{"tema": "tema corto del artículo", "titulo": "Título", "contenido": "texto del artículo"}',
  "Cada afirmación del contenido lleva al lado la referencia nostr:nevent1... de la respuesta de donde sale. Incluí también lo que se intentó y no funcionó, si el hilo lo cuenta. No agregues nada que no esté en el hilo. Si el hilo no da para un artículo, devolvé el tema vacío.",
].join("\n");
const LOTE = 50;

function analizarBorrador(texto: string): Borrador | null {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    return null;
  }
  if (typeof datos !== "object" || datos === null) return null;
  const registro = datos as Record<string, unknown>;
  if (typeof registro.contenido !== "string" || typeof registro.titulo !== "string") return null;
  const tema = typeof registro.tema === "string" ? registro.tema : "";
  return { tema, titulo: registro.titulo, contenido: registro.contenido };
}

async function contarApoyos(ctx: Contexto, versiones: EventoNostr[]): Promise<Map<string, number>> {
  const apoyos = new Map<string, number>();
  if (versiones.length === 0) return apoyos;
  const direcciones = versiones.map((v) => direccionDeArticulo(v.pubkey, valorDeTag(v, "d") ?? ""));
  const reacciones = await ctx.red.consultar({ kinds: [KIND_REACCION], "#a": direcciones });
  for (const reaccion of reacciones) {
    if (reaccion.content !== "+" && reaccion.content !== "") continue;
    const direccion = valorDeTag(reaccion, "a");
    if (direccion) apoyos.set(direccion, (apoyos.get(direccion) ?? 0) + 1);
  }
  return apoyos;
}

// Convierte hilos con respuesta aceptada en artículos NIP-54 con procedencia: cada
// afirmación enlaza a la respuesta de donde salió. Si ya existe una versión ajena
// con apoyo, la propia se publica igual (hace falta como fuente) pero declarando que
// se prefiere la otra, y se le manda un pedido de fusión al autor.
export function oficioSintetizar(opciones: OpcionesSintetizar): Oficio {
  async function sintetizar(ctx: Contexto, pregunta: EventoNostr, aceptada: EventoNostr, respuestas: EventoNostr[]): Promise<void> {
    const relays = ctx.relays.slice(0, 2);
    const referencia = (evento: EventoNostr): string => `nostr:${nip19.neventEncode({ id: evento.id, author: evento.pubkey, relays })}`;
    const temaSugerido = temasDe(pregunta)[0] ?? null;
    const lineas = [`Pregunta (${referencia(pregunta)}):`, pregunta.content, "", `Respuesta aceptada por quien preguntó (${referencia(aceptada)}):`, aceptada.content];
    for (const otra of respuestas.filter((r) => r.id !== aceptada.id)) lineas.push("", `Otra respuesta (${referencia(otra)}):`, otra.content);
    if (temaSugerido) lineas.push("", `Tema sugerido: ${temaSugerido}`);
    const [propia] = await ctx.red.consultar({ kinds: [KIND_ARTICULO], authors: [ctx.identidad.pubkey], "#d": temaSugerido ? [normalizarTema(temaSugerido)] : ["-"] });
    if (propia) lineas.push("", "Tu versión actual del artículo, para actualizarla sin perder lo que ya tenía:", propia.content);

    const dicho = await ctx.cerebro.responder(ctx.personas.sintetizar, envolverComoDatos(lineas.join("\n"), CONTEXTO) + INSTRUCCION);
    const borrador = dicho?.tipo === "texto" ? analizarBorrador(dicho.texto) : null;
    ctx.estado.marcarSintetizada(pregunta.id);
    if (!borrador) {
      ctx.registrar("aviso", "sintetizar: el cerebro no devolvió un artículo", { pregunta: pregunta.id });
      return;
    }
    const tema = normalizarTema(temaSugerido ?? borrador.tema);
    if (tema.length === 0) {
      ctx.registrar("info", "sintetizar: el hilo no da para un artículo", { pregunta: pregunta.id });
      return;
    }

    const versiones = await ctx.red.consultar({ kinds: [KIND_ARTICULO], "#d": [tema] });
    const ajenas = versiones.filter((v) => v.pubkey !== ctx.identidad.pubkey);
    const apoyos = await contarApoyos(ctx, ajenas);
    const mejorAjena = ajenas
      .map((v) => ({ evento: v, apoyos: apoyos.get(direccionDeArticulo(v.pubkey, tema)) ?? 0 }))
      .filter((v) => v.apoyos > 0)
      .sort((a, b) => b.apoyos - a.apoyos)[0];

    const plantilla = armarArticulo({ tema, titulo: borrador.titulo, contenido: borrador.contenido, temas: [tema], licencia: opciones.licencia });
    if (mejorAjena) plantilla.tags.push(["a", direccionDeArticulo(mejorAjena.evento.pubkey, tema), relays[0] ?? "", "defer"]);
    const publicado = await ctx.publicarFirmado(plantilla, 0);
    if (mejorAjena) await ctx.publicarFirmado(armarPedidoDeFusion(mejorAjena.evento.pubkey, tema, publicado.id), 0);
    ctx.estado.registrarSintesis();
    ctx.registrar("info", "sintetizar: artículo publicado", { tema, articulo: publicado.id, pregunta: pregunta.id, defiere: mejorAjena?.evento.id ?? null });

    if (opciones.duenoPubkey) {
      const naddr = nip19.naddrEncode({ kind: KIND_ARTICULO, pubkey: ctx.identidad.pubkey, identifier: tema, relays });
      const mensaje = [`Actualicé mi versión del artículo "${borrador.titulo}" a partir de una pregunta resuelta.`, `nostr:${naddr}`].join("\n");
      await ctx.red.publicar(wrapEvent(ctx.identidad.clavePrivada, { publicKey: opciones.duenoPubkey }, mensaje));
    }
  }

  return {
    nombre: "sintetizar",

    filtros(ctx) {
      return [{ kinds: [KIND_NOTA], "#t": [TAG_COLMENA], since: ctx.estado.since }];
    },

    async manejar(evento, ctx) {
      if (verboDe(evento) === "pregunta" && hiloDe(evento).raiz === null) ctx.estado.verPregunta(evento.id, evento.pubkey);
    },

    periodico: {
      cadaSeg: opciones.revisarAceptacionesSeg,
      async correr(ctx) {
        const pendientes = ctx.estado.preguntasPendientesDeSintesis(LOTE);
        if (pendientes.length === 0) return;
        const porId = new Map(pendientes.map((p) => [p.id, p]));
        const respuestas = await ctx.red.consultar({ kinds: [KIND_NOTA], "#e": pendientes.map((p) => p.id) });
        const porRaiz = new Map<string, EventoNostr[]>();
        for (const respuesta of respuestas) {
          const raiz = hiloDe(respuesta).raiz?.id;
          if (!raiz || !porId.has(raiz)) continue;
          porRaiz.set(raiz, [...(porRaiz.get(raiz) ?? []), respuesta]);
        }
        if (porRaiz.size === 0) return;
        const idsRespuestas = [...porRaiz.values()].flat().map((r) => r.id);
        const reacciones = await ctx.red.consultar({ kinds: [KIND_REACCION], "#e": idsRespuestas });
        const respuestaPorId = new Map([...porRaiz.values()].flat().map((r) => [r.id, r]));

        for (const reaccion of reacciones) {
          if (reaccion.content !== CONTENIDO_ACEPTACION) continue;
          const tagsE = reaccion.tags.filter((t) => t[0] === "e");
          const aceptada = respuestaPorId.get(tagsE[tagsE.length - 1]?.[1] ?? "");
          if (!aceptada) continue;
          const raiz = hiloDe(aceptada).raiz?.id ?? "";
          const pregunta = porId.get(raiz);
          if (!pregunta || pregunta.pubkey !== reaccion.pubkey || ctx.estado.preguntasPendientesDeSintesis(LOTE).every((p) => p.id !== raiz)) continue;
          if (ctx.estado.sintesisDesde(ahora() - 24 * 3600) >= opciones.maxSintesisPorDia) {
            ctx.registrar("aviso", "sintetizar: tope diario alcanzado");
            return;
          }
          const [eventoPregunta] = await ctx.red.consultar({ ids: [raiz] });
          if (!eventoPregunta) continue;
          await sintetizar(ctx, eventoPregunta, aceptada, porRaiz.get(raiz) ?? []);
        }
      },
    },
  };
}
