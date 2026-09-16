import type { Filter } from "nostr-tools/filter";
import * as nip19 from "nostr-tools/nip19";
import { wrapEvent } from "nostr-tools/nip17";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_ARTICULO, KIND_ARTICULO_LARGO, KIND_NOTA, KIND_PUBLICACION, ahora, imetaDe, temasDe, valorDeTag } from "@botella/protocolo";
import { envolverComoDatos } from "../nucleo/cerebro";
import type { Oficio } from "../nucleo/oficio";

export interface OpcionesCurar {
  duenoPubkey: string;
  temasCurados: string[];
  palabrasClave: string[];
  umbralConfianza: number;
  maxClasificacionesPorDia: number;
  preguntarAlAutor: boolean;
}

const CONTEXTO = "Publicación nueva en la red. Decidí si le interesa a tu dueño según sus intereses declarados.";

interface Descripcion {
  titulo: string | null;
  texto: string;
  temas: string[];
  alt: string | null;
  lugar: string | null;
  imagenUrl: string | null;
}

function describir(evento: EventoNostr): Descripcion {
  const imeta = imetaDe(evento);
  return {
    titulo: valorDeTag(evento, "title"),
    texto: evento.content,
    temas: temasDe(evento),
    alt: imeta?.alt ?? null,
    lugar: valorDeTag(evento, "location"),
    imagenUrl: evento.kind === KIND_PUBLICACION ? (imeta?.url ?? null) : null,
  };
}

function tipoDe(kind: number): string {
  switch (kind) {
    case KIND_PUBLICACION:
      return "imagen";
    case KIND_ARTICULO_LARGO:
      return "artículo largo";
    case KIND_ARTICULO:
      return "artículo de la wiki";
    default:
      return "nota";
  }
}

function textoParaElModelo(evento: EventoNostr, descripcion: Descripcion): string {
  const lineas = [`Tipo: ${tipoDe(evento.kind)}`];
  if (descripcion.titulo) lineas.push(`Título: ${descripcion.titulo}`);
  if (descripcion.alt) lineas.push(`Descripción de la imagen: ${descripcion.alt}`);
  if (descripcion.lugar) lineas.push(`Lugar: ${descripcion.lugar}`);
  if (descripcion.temas.length > 0) lineas.push(`Temas: ${descripcion.temas.join(", ")}`);
  lineas.push("", descripcion.texto.slice(0, 4000));
  return lineas.join("\n");
}

function pasaElPrefiltro(descripcion: Descripcion, palabrasClave: string[]): boolean {
  if (palabrasClave.length === 0) return true;
  const pajar = [descripcion.titulo ?? "", descripcion.texto, descripcion.alt ?? "", descripcion.lugar ?? "", ...descripcion.temas].join("\n").toLowerCase();
  return palabrasClave.some((palabra) => pajar.includes(palabra.toLowerCase()));
}

// Lee la red por el dueño. Nunca el firehose completo de notas: solo imágenes,
// artículos y las notas con los temas que el dueño pidió, y con un prefiltro barato
// antes de gastar inferencia. Cuando algo coincide, le avisa por mensaje privado
// NIP-17, que le llega a cualquier cliente que lo soporte.
export function oficioCurar(opciones: OpcionesCurar): Oficio {
  return {
    nombre: "curar",

    filtros(ctx) {
      const filtros: Filter[] = [{ kinds: [KIND_PUBLICACION, KIND_ARTICULO_LARGO, KIND_ARTICULO], since: ctx.estado.since }];
      if (opciones.temasCurados.length > 0) filtros.push({ kinds: [KIND_NOTA], "#t": opciones.temasCurados, since: ctx.estado.since });
      return filtros;
    },

    async manejar(evento, ctx) {
      if (evento.pubkey === opciones.duenoPubkey || ctx.estado.hallazgoAvisado(evento.id)) return;
      const descripcion = describir(evento);
      if (descripcion.texto.trim().length + (descripcion.titulo?.length ?? 0) < 3) return;
      if (!pasaElPrefiltro(descripcion, opciones.palabrasClave)) return;

      const momento = ahora();
      if (ctx.estado.clasificacionesDesde(momento - 24 * 3600) >= opciones.maxClasificacionesPorDia) {
        ctx.registrar("aviso", "curar: tope diario de clasificaciones alcanzado, dejo pasar", { evento: evento.id });
        return;
      }
      ctx.estado.registrarClasificacion(momento);

      const veredicto = await ctx.cerebro.clasificar(ctx.personas.curar, envolverComoDatos(textoParaElModelo(evento, descripcion), CONTEXTO), descripcion.imagenUrl ?? undefined);
      if (!veredicto || !veredicto.coincide || veredicto.confianza < opciones.umbralConfianza) {
        ctx.registrar("info", "curar: no coincide", { evento: evento.id, motivo: veredicto?.motivo ?? "sin veredicto", confianza: veredicto?.confianza ?? 0 });
        return;
      }

      const enlace = nip19.neventEncode({ id: evento.id, author: evento.pubkey, relays: ctx.relays.slice(0, 2) });
      const titulo = descripcion.titulo ?? descripcion.texto.replace(/\s+/g, " ").slice(0, 80);
      const mensaje = [`Hallazgo: ${titulo}`, `Por qué te puede interesar: ${veredicto.motivo}`, `nostr:${enlace}`].join("\n");
      const envuelto = wrapEvent(ctx.identidad.clavePrivada, { publicKey: opciones.duenoPubkey }, mensaje);
      const resultado = await ctx.red.publicar(envuelto);
      if (resultado.exitos.length === 0) throw new Error(`no pude avisarle al dueño: ${resultado.fallos.map((f) => f.motivo).join("; ")}`);
      ctx.estado.registrarHallazgo(evento.id, momento);
      ctx.registrar("info", "curar: hallazgo avisado al dueño", { evento: evento.id, confianza: veredicto.confianza });

      if (opciones.preguntarAlAutor) {
        const pregunta = `Encontré esta publicación para alguien que se interesa por lo que hacés. ¿Podés contar el contexto: qué es, de dónde viene, qué significa? nostr:${enlace}`;
        await ctx.preguntarALaRed(pregunta, { temas: descripcion.temas, menciones: [evento.pubkey], cita: { id: evento.id, pubkey: evento.pubkey } });
      }
    },
  };
}
