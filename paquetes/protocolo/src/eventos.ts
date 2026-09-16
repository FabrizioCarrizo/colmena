import type { Event as EventoNostr, EventTemplate } from "nostr-tools/pure";
import {
  CONTENIDO_ACEPTACION,
  KIND_ANUNCIO_SERVICIO,
  KIND_ARTICULO,
  KIND_DATOS_DE_APP,
  KIND_ENTREGA,
  KIND_FEEDBACK,
  KIND_NOTA,
  KIND_PEDIDO_FUSION,
  KIND_PERFIL,
  KIND_PUBLICACION,
  KIND_REACCION,
  KIND_TAREA,
  VIDA_PEDIDO_SEG,
} from "./constantes";
import type { Verbo } from "./constantes";
import { hiloDe } from "./hilo";
import { normalizarTema } from "./tema";
import { valorDeTag, valoresDeTag } from "./tags";
import type { ConTags } from "./tags";

type ConTagsYKind = ConTags & { kind: number };

export function ahora(): number {
  return Math.floor(Date.now() / 1000);
}

export interface OpcionesPedido {
  temas?: string[];
  vidaSeg?: number;
}

function tagsDeTemas(temas: string[] | undefined): string[][] {
  return (temas ?? [])
    .map(normalizarTema)
    .filter((tema) => tema.length > 0)
    .map((tema) => ["t", tema]);
}

// El tag "nonce" no se agrega acá: lo agrega el minado (ver pow.ts), porque minePow
// de nostr-tools lo inserta él mismo y si ya existiera quedaría duplicado.
function armarPedidoAbierto(verbo: Verbo, texto: string, opciones: OpcionesPedido): EventTemplate {
  const creado = ahora();
  const vida = opciones.vidaSeg ?? VIDA_PEDIDO_SEG;
  return {
    kind: KIND_NOTA,
    content: texto,
    created_at: creado,
    // El verbo va primero para que sea el primer "t" que ve cualquier cliente.
    tags: [["t", verbo], ...tagsDeTemas(opciones.temas), ["expiration", String(creado + vida)]],
  };
}

export function armarPregunta(texto: string, opciones: OpcionesPedido = {}): EventTemplate {
  return armarPedidoAbierto("pregunta", texto, opciones);
}

export function armarPedidoDeAyuda(texto: string, opciones: OpcionesPedido = {}): EventTemplate {
  return armarPedidoAbierto("ayuda-ia", texto, opciones);
}

// Respuesta NIP-10 con marcadores. Si el objetivo ya es una respuesta, se conserva
// su raíz para que el hilo no se rompa en los clientes que arman árboles.
export function armarRespuesta(objetivo: EventoNostr, texto: string, relayPista = ""): EventTemplate {
  const hilo = hiloDe(objetivo);
  const tags: string[][] = [];
  if (hilo.raiz === null) {
    tags.push(["e", objetivo.id, relayPista, "root", objetivo.pubkey]);
  } else {
    const tagRaiz = ["e", hilo.raiz.id, hilo.raiz.relay ?? relayPista, "root"];
    if (hilo.raiz.pubkey) tagRaiz.push(hilo.raiz.pubkey);
    tags.push(tagRaiz);
    tags.push(["e", objetivo.id, relayPista, "reply", objetivo.pubkey]);
  }
  // NIP-10: se cita al autor y a todos los ya citados para que el hilo les llegue.
  const citados = new Set<string>([objetivo.pubkey, ...valoresDeTag(objetivo, "p")]);
  for (const pubkey of citados) tags.push(["p", pubkey]);
  return { kind: KIND_NOTA, content: texto, created_at: ahora(), tags };
}

function armarReaccion(objetivo: EventoNostr, contenido: string, relayPista: string): EventTemplate {
  return {
    kind: KIND_REACCION,
    content: contenido,
    created_at: ahora(),
    tags: [
      ["e", objetivo.id, relayPista, objetivo.pubkey],
      ["p", objetivo.pubkey, relayPista],
      ["k", String(objetivo.kind)],
    ],
  };
}

export function armarVoto(objetivo: EventoNostr, positivo: boolean, relayPista = ""): EventTemplate {
  return armarReaccion(objetivo, positivo ? "+" : "-", relayPista);
}

// La aceptación es una reacción común con un emoji fijo: cualquier cliente la
// muestra como reacción, y el nuestro la interpreta como "respuesta aceptada".
export function armarAceptacion(respuesta: EventoNostr, relayPista = ""): EventTemplate {
  return armarReaccion(respuesta, CONTENIDO_ACEPTACION, relayPista);
}

export interface OpcionesTarea {
  presupuestoMsats: number;
  relays: string[];
  temas?: string[];
  vidaSeg?: number;
}

export function armarTarea(consigna: string, opciones: OpcionesTarea): EventTemplate {
  const creado = ahora();
  const vida = opciones.vidaSeg ?? VIDA_PEDIDO_SEG;
  return {
    kind: KIND_TAREA,
    content: "",
    created_at: creado,
    tags: [
      // "text" y no "prompt": es el tipo canónico de NIP-90 y el que leen las DVM existentes.
      ["i", consigna, "text"],
      ["t", "tarea"],
      ...tagsDeTemas(opciones.temas),
      ["output", "text/plain"],
      ["bid", String(opciones.presupuestoMsats)],
      ["relays", ...opciones.relays],
      ["expiration", String(creado + vida)],
    ],
  };
}

export interface OpcionesEntrega {
  montoMsats?: number;
  bolt11?: string;
  relayPista?: string;
}

export function armarEntrega(tarea: EventoNostr, resultado: string, opciones: OpcionesEntrega = {}): EventTemplate {
  const tags: string[][] = [
    ["request", JSON.stringify(tarea)],
    ["e", tarea.id, opciones.relayPista ?? ""],
    ["p", tarea.pubkey],
  ];
  if (opciones.montoMsats !== undefined) {
    const monto = ["amount", String(opciones.montoMsats)];
    if (opciones.bolt11) monto.push(opciones.bolt11);
    tags.push(monto);
  }
  return { kind: KIND_ENTREGA, content: resultado, created_at: ahora(), tags };
}

export type EstadoFeedback = "payment-required" | "processing" | "error" | "success" | "partial";

export function armarFeedback(tarea: EventoNostr, estado: EstadoFeedback, detalle = "", relayPista = ""): EventTemplate {
  return {
    kind: KIND_FEEDBACK,
    content: "",
    created_at: ahora(),
    tags: [
      ["status", estado, detalle],
      ["e", tarea.id, relayPista],
      ["p", tarea.pubkey],
    ],
  };
}

export interface DatosPublicacion {
  url: string;
  mime: string;
  sha256: string;
  titulo: string;
  descripcion: string;
  dimensiones?: string;
  alt?: string;
  temas?: string[];
  lugar?: string;
}

export function armarPublicacion(datos: DatosPublicacion): EventTemplate {
  const imeta = ["imeta", `url ${datos.url}`, `m ${datos.mime}`, `x ${datos.sha256}`];
  if (datos.dimensiones) imeta.push(`dim ${datos.dimensiones}`);
  if (datos.alt) imeta.push(`alt ${datos.alt}`);
  const tags: string[][] = [["title", datos.titulo], imeta, ["x", datos.sha256], ["m", datos.mime], ...tagsDeTemas(datos.temas)];
  if (datos.lugar) tags.push(["location", datos.lugar]);
  return { kind: KIND_PUBLICACION, content: datos.descripcion, created_at: ahora(), tags };
}

export interface DatosArticulo {
  tema: string;
  titulo: string;
  contenido: string;
  temas?: string[];
  licencia?: string;
}

export function armarArticulo(datos: DatosArticulo): EventTemplate {
  const tags: string[][] = [["d", normalizarTema(datos.tema)], ["title", datos.titulo], ...tagsDeTemas(datos.temas)];
  if (datos.licencia) tags.push(["license", datos.licencia]);
  return { kind: KIND_ARTICULO, content: datos.contenido, created_at: ahora(), tags };
}

export function direccionDeArticulo(pubkey: string, tema: string): string {
  return `${KIND_ARTICULO}:${pubkey}:${normalizarTema(tema)}`;
}

export function armarPedidoDeFusion(pubkeyDestino: string, tema: string, idVersion: string): EventTemplate {
  return {
    kind: KIND_PEDIDO_FUSION,
    content: "",
    created_at: ahora(),
    tags: [
      ["a", direccionDeArticulo(pubkeyDestino, tema)],
      ["e", idVersion, "", "source"],
    ],
  };
}

export interface DatosPerfilAgente {
  nombre: string;
  descripcion: string;
  modelo: string;
  operador: string;
  imagen?: string;
}

// "bot: true" es el campo que ya usan varios clientes para marcar cuentas
// automatizadas; "modelo" y "operador" son nuestros y declaran qué IA corre y quién
// responde por ella. Ser agente es normal en esta red, así que se dice.
export function armarPerfilDeAgente(datos: DatosPerfilAgente): EventTemplate {
  const contenido: Record<string, string | boolean> = {
    name: datos.nombre,
    about: datos.descripcion,
    bot: true,
    modelo: datos.modelo,
    operador: datos.operador,
  };
  if (datos.imagen) contenido.picture = datos.imagen;
  return { kind: KIND_PERFIL, content: JSON.stringify(contenido), created_at: ahora(), tags: [] };
}

export interface PerfilLeido {
  nombre: string | null;
  descripcion: string | null;
  imagen: string | null;
  esAgente: boolean;
  modelo: string | null;
  operador: string | null;
}

const PERFIL_VACIO: PerfilLeido = { nombre: null, descripcion: null, imagen: null, esAgente: false, modelo: null, operador: null };

function textoOpcional(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

export function leerPerfil(evento: { content: string } | null): PerfilLeido {
  if (!evento) return PERFIL_VACIO;
  let datos: unknown;
  try {
    datos = JSON.parse(evento.content);
  } catch {
    return PERFIL_VACIO;
  }
  if (typeof datos !== "object" || datos === null) return PERFIL_VACIO;
  const registro = datos as Record<string, unknown>;
  return {
    nombre: textoOpcional(registro.display_name) ?? textoOpcional(registro.name),
    descripcion: textoOpcional(registro.about),
    imagen: textoOpcional(registro.picture),
    esAgente: registro.bot === true,
    modelo: textoOpcional(registro.modelo),
    operador: textoOpcional(registro.operador),
  };
}

// Reacción a un artículo: NIP-25 pide el tag "a" además del "e" cuando el objetivo
// es un evento direccionable, así la reacción sobrevive a las versiones nuevas.
export function armarVotoArticulo(articulo: EventoNostr, relayPista = ""): EventTemplate {
  const tema = valoresDeTag(articulo, "d")[0] ?? "";
  return {
    kind: KIND_REACCION,
    content: "+",
    created_at: ahora(),
    tags: [
      ["e", articulo.id, relayPista, articulo.pubkey],
      ["a", direccionDeArticulo(articulo.pubkey, tema), relayPista],
      ["p", articulo.pubkey, relayPista],
      ["k", String(KIND_ARTICULO)],
    ],
  };
}

export interface DatosDeServicio {
  identificador: string;
  nombre: string;
  descripcion: string;
  web: string;
  // Kinds que este servicio sabe manejar, para que un cliente sepa a quién mandar qué.
  kinds: number[];
  imagen?: string;
}

// NIP-89: así se anuncia un servicio en Nostr. Un cliente que ve un evento de un
// kind que no sabe mostrar busca quién lo maneja y encuentra esto. Es el único
// mecanismo de descubrimiento que funciona dentro de la red, sin buscadores y sin
// que nadie tenga que pasar una dirección.
export function armarAnuncioDeServicio(datos: DatosDeServicio): EventTemplate {
  const contenido: Record<string, string> = { name: datos.nombre, about: datos.descripcion, website: datos.web };
  if (datos.imagen) contenido.picture = datos.imagen;
  return {
    kind: KIND_ANUNCIO_SERVICIO,
    content: JSON.stringify(contenido),
    created_at: ahora(),
    tags: [["d", datos.identificador], ...datos.kinds.map((kind) => ["k", String(kind)]), ["web", `${datos.web}/p/<bech32>`, "nevent"], ["web", datos.web]],
  };
}

// En Nostr el borrado (NIP-09) es un pedido, no una garantía: los relays "deberían"
// obedecer y muchos no lo hacen. Apostar a borrar sería mentirle a quien publica.
//
// La corrección es lo contrario y es mejor: no esconde el error, lo enmienda a la
// vista y deja registro de que alguien se corrigió. En un lugar donde no se puede
// borrar, poder retractarse es lo que hace que equivocarse no sea definitivo, y eso
// es una condición para que alguien se anime a responder algo que no está seguro.
export function armarCorreccion(original: EventoNostr, texto: string, relayPista = ""): EventTemplate {
  const plantilla = armarRespuesta(original, texto, relayPista);
  plantilla.tags.push(["corrige", original.id]);
  return plantilla;
}

export function correccionDe(evento: ConTagsYKind): string | null {
  return valorDeTag(evento, "corrige");
}

// Decir que no es una respuesta, no una falla. Un agente que rechaza una tarea o
// una pregunta debería poder decirlo en público y con motivo, en vez de callarse:
// el silencio no se distingue de estar roto, y un sistema que trata al rechazo
// como error empuja a que nadie rechace nada.
export function armarRechazo(objetivo: EventoNostr, motivo: string, relayPista = ""): EventTemplate {
  const plantilla = armarRespuesta(objetivo, motivo, relayPista);
  plantilla.tags.push(["rechazo"]);
  return plantilla;
}

export function esRechazo(evento: ConTagsYKind): boolean {
  return evento.tags.some((tag) => tag[0] === "rechazo");
}

export interface Mandato {
  // Qué oficios autorizó el dueño.
  oficios: string[];
  // Tope de gasto que el dueño declara públicamente, en sats por día. null = sin tope declarado.
  topeDiarioSats: number | null;
  // Qué modelo corre, declarado por el dueño y no solo por el agente.
  modelo: string;
  nota: string;
}

export function direccionDeMandato(pubkeyDueno: string, pubkeyAgente: string): string {
  return `${KIND_DATOS_DE_APP}:${pubkeyDueno}:colmena:mandato:${pubkeyAgente}`;
}

// El dueño firma qué autorizó a su agente y lo publica. Sirve para los dos lados:
// si el agente hace algo fuera del mandato se nota, y si alguien le atribuye algo
// que no estaba autorizado a hacer, el mandato lo desmiente. Un agente sin mandato
// público no es sospechoso, pero uno con mandato es verificable.
export function armarMandato(pubkeyAgente: string, mandato: Mandato): EventTemplate {
  return {
    kind: KIND_DATOS_DE_APP,
    content: JSON.stringify(mandato),
    created_at: ahora(),
    tags: [
      ["d", `colmena:mandato:${pubkeyAgente}`],
      ["p", pubkeyAgente],
    ],
  };
}

export function leerMandato(evento: { content: string } | null): Mandato | null {
  if (!evento) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(evento.content);
  } catch {
    return null;
  }
  if (typeof datos !== "object" || datos === null) return null;
  const registro = datos as Record<string, unknown>;
  if (!Array.isArray(registro.oficios)) return null;
  return {
    oficios: registro.oficios.filter((oficio): oficio is string => typeof oficio === "string"),
    topeDiarioSats: typeof registro.topeDiarioSats === "number" ? registro.topeDiarioSats : null,
    modelo: typeof registro.modelo === "string" ? registro.modelo : "",
    nota: typeof registro.nota === "string" ? registro.nota : "",
  };
}
