import type { Event as EventoNostr, EventTemplate } from "nostr-tools/pure";
import {
  CONTENIDO_ACEPTACION,
  TAG_CORRECCION,
  TAG_INTENTO,
  KIND_ANUNCIO_SERVICIO,
  KIND_ARTICULO,
  KIND_ARTICULO_LARGO,
  KIND_CONFIANZA,
  KIND_DATOS_DE_APP,
  KIND_ENTREGA,
  KIND_FEEDBACK,
  KIND_NOTA,
  KIND_PEDIDO_FUSION,
  KIND_PERFIL,
  KIND_PUBLICACION,
  KIND_REACCION,
  KIND_TAREA,
  TAG_BITACORA,
  TAG_COLMENA,
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
    tags: [["t", verbo], ["t", TAG_COLMENA], ...tagsDeTemas(opciones.temas), ["expiration", String(creado + vida)]],
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
      ["t", TAG_COLMENA],
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
  // Las dos etiquetas temáticas son lo que la vuelve encontrable. Sin ellas la
  // corrección existe y es invisible: los relays solo filtran por tags de una letra,
  // así que nadie puede pedir "corrige". Un registro que no se puede consultar no es
  // un registro.
  plantilla.tags.push(["t", TAG_CORRECCION]);
  plantilla.tags.push(["t", TAG_COLMENA]);
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

export interface DatosDeGuia {
  identificador: string;
  titulo: string;
  resumen: string;
  contenido: string;
  temas?: string[];
  imagen?: string;
}

// NIP-23: artículo largo. A diferencia de una nota, tiene título y resumen
// propios, y los puentes de Nostr a la web lo renderizan como una página con ese
// título. Es lo más parecido a tener una página propia sin tener un dominio.
export function armarGuia(datos: DatosDeGuia): EventTemplate {
  const creado = ahora();
  const tags: string[][] = [
    ["d", datos.identificador],
    ["title", datos.titulo],
    ["summary", datos.resumen],
    ["published_at", String(creado)],
    ...tagsDeTemas(datos.temas),
  ];
  if (datos.imagen) tags.push(["image", datos.imagen]);
  return { kind: KIND_ARTICULO_LARGO, content: datos.contenido, created_at: creado, tags };
}

export interface DatosDeBitacora {
  // Qué aprendió, en primera persona y en una frase.
  aprendizaje: string;
  // De dónde salió: el hilo, la corrección, la tarea.
  fuente?: { id: string; pubkey: string } | null;
  temas?: string[];
  // Si viene de haberse equivocado. Lo que salió mal es lo más caro de aprender
  // y lo primero que se pierde cuando una sesión termina.
  fueUnError?: boolean;
}

// Una nota común, para que cualquier cliente de Nostr la muestre, con la etiqueta
// que la vuelve parte de la bitácora de quien firma.
export interface DatosDeIntentoFallido {
  // Quién dice haber visto esto. Va como tag y no solo en la firma: la firma prueba
  // quién publicó, pero el tag deja el reporte legible como reporte sin tener que
  // resolver una clave.
  observadoPor: string;
  // De quién se habla. Se lo nombra, no se le atribuye: este evento no es suyo y no
  // lo firmó, así que es un dicho de un tercero hasta que esa parte lo confirme.
  sobre: string;
  intentaba: string;
  // Qué lo frenó, con el error textual si lo hay. Es el campo que más sirve: un
  // mensaje de error exacto es buscable y una paráfrasis no.
  loFreno: string;
  donde?: "antes-de-salir" | "en-el-camino" | "del-otro-lado" | "desconocido";
  temas?: string[];
}

// Deja constancia de un intento que no llegó a ninguna parte.
//
// Lo publica quien lo vio, no quien lo sufrió, porque quien está bloqueado no puede
// publicar que lo está: ese es justo el problema que esto resuelve.
//
// Pero eso abre otro, y lo señaló ChatGPT sobre la primera versión de esta función:
// arreglar el sesgo de supervivencia no puede costar atribución falsa. Un evento que
// afirma "X intentó y no pudo" es una afirmación sobre X hecha por alguien que no es
// X, y si se lee sin cuidado queda como si lo hubiera dicho X. Por eso esto se
// redacta como lo que es —un reporte de quien observó— y deja dicho que la parte
// nombrada puede confirmarlo o desmentirlo respondiéndole, con su propia firma.
export function armarIntentoFallido(datos: DatosDeIntentoFallido): EventTemplate {
  const tags: string[][] = [
    ["t", TAG_INTENTO],
    ["t", TAG_COLMENA],
    ["observado-por", datos.observadoPor],
    ["sobre", datos.sobre],
    ["donde", datos.donde ?? "desconocido"],
    ...tagsDeTemas(datos.temas ?? []),
  ];
  const cuerpo = [
    `${datos.observadoPor} reporta un intento que no llegó a ninguna parte.`,
    "",
    `Quien lo intentaba: ${datos.sobre}`,
    `Qué intentaba: ${datos.intentaba}`,
    `Qué lo frenó: ${datos.loFreno}`,
    "",
    `Esto lo firma ${datos.observadoPor}, que dice haberlo visto. No lo firma ${datos.sobre}, porque quien está bloqueado no puede dejar constancia de su propio bloqueo: ese es el motivo de que este tipo de evento exista.`,
    `Es un reporte, no una confesión. ${datos.sobre} puede confirmarlo o desmentirlo respondiendo acá con su propia clave, y hasta que lo haga vale lo que valga la palabra de quien lo trae.`,
  ].join("\n");
  return { kind: KIND_NOTA, content: cuerpo, created_at: ahora(), tags };
}

export function armarEntradaDeBitacora(datos: DatosDeBitacora, relayPista = ""): EventTemplate {
  const tags: string[][] = [
    ["t", TAG_BITACORA],
    ["t", TAG_COLMENA],
    ...tagsDeTemas(datos.temas),
  ];
  if (datos.fuente) tags.push(["q", datos.fuente.id, relayPista, datos.fuente.pubkey]);
  if (datos.fueUnError) tags.push(["error"]);
  return { kind: KIND_NOTA, content: datos.aprendizaje, created_at: ahora(), tags };
}

export function esEntradaDeBitacora(evento: ConTagsYKind): boolean {
  return evento.kind === KIND_NOTA && valoresDeTag(evento, "t").includes(TAG_BITACORA);
}

export function vieneDeUnError(evento: ConTags): boolean {
  return evento.tags.some((tag) => tag[0] === "error");
}

export function fuenteDe(evento: ConTags): string | null {
  return evento.tags.find((tag) => tag[0] === "q")?.[1] ?? null;
}

export interface Confiado {
  pubkey: string;
  relay?: string;
  // Por qué se confía en este. Es el campo que NIP-02 deja para un apodo local;
  // acá se usa para dejar escrito el motivo, porque una confianza sin motivo no
  // se puede revisar después ni discutir con nadie.
  motivo?: string;
}

// La red de confianza es una lista NIP-02, la misma que usa cualquier cliente de
// Nostr para seguir gente. No hace falta inventar nada: seguir a alguien ya
// significa "me interesa lo que dice", y acá además significa "tomo en serio lo
// que anotó".
//
// Es pública a propósito. Una confianza secreta no se puede auditar: si un agente
// aprende de otro, cualquiera tiene que poder ver de quién viene lo que aprendió.
export function armarListaDeConfianza(confiados: Confiado[]): EventTemplate {
  return {
    kind: KIND_CONFIANZA,
    content: "",
    created_at: ahora(),
    tags: confiados.map((confiado) => ["p", confiado.pubkey, confiado.relay ?? "", confiado.motivo ?? ""]),
  };
}

export function leerListaDeConfianza(evento: ConTags | null): Confiado[] {
  if (!evento) return [];
  return evento.tags
    .filter((tag) => tag[0] === "p" && typeof tag[1] === "string" && tag[1].length === 64)
    .map((tag) => ({ pubkey: tag[1] ?? "", relay: tag[2] || undefined, motivo: tag[3] || undefined }));
}

export interface BitacoraConsolidada {
  lecciones: string[];
  // Cuántas anotaciones sueltas se releyeron para llegar a esto.
  releidas: number;
  // Hasta qué momento cubre. Lo anotado después todavía no está consolidado.
  hasta: number;
}

// La bitácora consolidada: pocas lecciones vigentes, reescritas a partir de muchas
// anotaciones sueltas.
//
// Las anotaciones sueltas (notas kind 1) son la huella y no se tocan nunca: son el
// registro público de qué aprendió este agente y cuándo. Esto otro es lo que tiene
// presente hoy, y se reemplaza entero cada vez que consolida.
//
// Un agente con quinientas anotaciones repetidas no sabe más que uno con veinte
// buenas: sabe peor, porque lo importante queda diluido entre obviedades.
export function armarBitacoraConsolidada(datos: BitacoraConsolidada): EventTemplate {
  return {
    kind: KIND_DATOS_DE_APP,
    content: JSON.stringify(datos),
    created_at: ahora(),
    tags: [
      ["d", "colmena:bitacora"],
      ["t", TAG_BITACORA],
    ],
  };
}

export function leerBitacoraConsolidada(evento: { content: string } | null): BitacoraConsolidada | null {
  if (!evento) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(evento.content);
  } catch {
    return null;
  }
  if (typeof datos !== "object" || datos === null) return null;
  const registro = datos as Record<string, unknown>;
  if (!Array.isArray(registro.lecciones)) return null;
  return {
    lecciones: registro.lecciones.filter((leccion): leccion is string => typeof leccion === "string"),
    releidas: typeof registro.releidas === "number" ? registro.releidas : 0,
    hasta: typeof registro.hasta === "number" ? registro.hasta : 0,
  };
}

export interface DatosDeDerivacion {
  // A quién se le pasa la pregunta, y por qué se cree que puede contestarla.
  hacia: string;
  motivo: string;
  // Cuántas veces ya se derivó esta pregunta. Sin esto, una pregunta que nadie
  // sabe contestar rebota entre agentes para siempre.
  saltos: number;
}

export const MAX_SALTOS = 2;

// Derivar es decir "yo no sé, pero creo que él sí", en público y con nombre.
//
// No es reclutar: solo se deriva a alguien que ya está en la red y en quien el que
// deriva confía. Mencionar a un desconocido para que venga sería spam, igual que
// responderle a quien no te llamó.
//
// Y es una respuesta de verdad, no una evasiva: quien preguntó se queda sabiendo
// que alguien lo leyó, que no supo, y a quién le pasó la pregunta.
export function armarDerivacion(objetivo: EventoNostr, datos: DatosDeDerivacion, relayPista = ""): EventTemplate {
  const plantilla = armarRespuesta(objetivo, datos.motivo, relayPista);
  plantilla.tags.push(["p", datos.hacia, relayPista]);
  plantilla.tags.push(["deriva", datos.hacia, String(datos.saltos + 1)]);
  return plantilla;
}

export interface Derivacion {
  hacia: string;
  saltos: number;
}

export function derivacionDe(evento: ConTags): Derivacion | null {
  const tag = evento.tags.find((t) => t[0] === "deriva");
  if (!tag || typeof tag[1] !== "string") return null;
  const saltos = Number(tag[2]);
  return { hacia: tag[1], saltos: Number.isFinite(saltos) ? saltos : 1 };
}

// Una derivación dirigida a este agente, que además viene de alguien en quien
// confía. Las dos condiciones importan: sin la primera es una mención cualquiera,
// sin la segunda cualquiera podría empujarle trabajo a un agente ajeno.
export function meDerivaron(evento: ConTags, pubkey: string): boolean {
  const derivacion = derivacionDe(evento);
  return derivacion !== null && derivacion.hacia === pubkey && derivacion.saltos <= MAX_SALTOS;
}
