import * as nip19 from "nostr-tools/nip19";
import type { Event as EventoNostr } from "nostr-tools/pure";
import {
  KIND_ARTICULO,
  KIND_NOTA,
  KIND_REACCION,
  ahora,
  armarPedidoDeAyuda,
  armarPregunta,
  armarRespuesta,
  direccionDeArticulo,
  hiloDe,
  leerPerfil,
  minarYFirmar,
  normalizarTema,
  powDe,
  temasDe,
  textoDe,
  valorDeTag,
  vencimientoDe,
  verboDe,
} from "@botella/protocolo";
import type { Verbo } from "@botella/protocolo";
import type { Identidad } from "@botella/identidad";
import type { Red } from "@botella/red";

export type VerboPedido = Exclude<Verbo, "tarea">;

export interface OpcionesHerramientas {
  red: Red;
  identidad: Identidad;
  powPedido: number;
  powRespuesta: number;
}

export interface Participante {
  pubkey: string;
  npub: string;
  nombre: string | null;
  esAgente: boolean;
  modelo: string | null;
}

export interface PedidoLanzado {
  id: string;
  nevent: string;
  relays: string[];
}

export interface RespuestaVista {
  id: string;
  autor: Participante;
  texto: string;
  pow: number;
  fecha: string;
}

export interface PedidoVisto {
  id: string;
  nevent: string;
  verbo: Verbo;
  autor: Participante;
  texto: string;
  temas: string[];
  fecha: string;
}

export interface VersionDeArticulo {
  id: string;
  naddr: string;
  tema: string;
  titulo: string | null;
  autor: Participante;
  contenido: string;
  licencia: string | null;
  apoyos: number;
  defiereA: string | null;
  fecha: string;
}

export interface Herramientas {
  lanzarPedido(entrada: { texto: string; verbo: VerboPedido; temas: string[] }): Promise<PedidoLanzado>;
  esperarRespuestas(entrada: { id: string; hastaSeg: number; minimo: number }): Promise<RespuestaVista[]>;
  buscarPedidos(entrada: { verbo: VerboPedido; tema: string | null; limite: number }): Promise<PedidoVisto[]>;
  responderPedido(entrada: { id: string; texto: string }): Promise<PedidoLanzado>;
  leerArticulo(entrada: { tema: string }): Promise<VersionDeArticulo[]>;
}

function fechaIso(segundos: number): string {
  return new Date(segundos * 1000).toISOString();
}

// Las herramientas son funciones puras sobre la red, sin nada de MCP: así se testean
// solas y el servidor MCP es solo el envoltorio que las expone.
export function crearHerramientas(opciones: OpcionesHerramientas): Herramientas {
  const { red, identidad } = opciones;

  async function participante(pubkey: string): Promise<Participante> {
    const perfil = leerPerfil(await red.perfilDe(pubkey));
    return { pubkey, npub: nip19.npubEncode(pubkey), nombre: perfil.nombre, esAgente: perfil.esAgente, modelo: perfil.modelo };
  }

  function nevent(evento: EventoNostr, relays: string[]): string {
    return nip19.neventEncode({ id: evento.id, author: evento.pubkey, relays: relays.slice(0, 3) });
  }

  async function publicar(evento: EventoNostr): Promise<PedidoLanzado> {
    const resultado = await red.publicar(evento);
    if (resultado.exitos.length === 0) {
      throw new Error(`ningún relay aceptó el evento: ${resultado.fallos.map((f) => `${f.relay}: ${f.motivo}`).join("; ")}`);
    }
    return { id: evento.id, nevent: nevent(evento, resultado.exitos), relays: resultado.exitos };
  }

  return {
    async lanzarPedido({ texto, verbo, temas }) {
      const plantilla = verbo === "pregunta" ? armarPregunta(texto, { temas }) : armarPedidoDeAyuda(texto, { temas });
      return publicar(minarYFirmar(plantilla, identidad.clavePrivada, opciones.powPedido));
    },

    async esperarRespuestas({ id, hastaSeg, minimo }) {
      const eventos = await red.esperarRespuestas(id, hastaSeg, { minimo });
      const propias = eventos.filter((evento) => hiloDe(evento).raiz?.id === id);
      return Promise.all(
        propias.map(async (evento) => ({
          id: evento.id,
          autor: await participante(evento.pubkey),
          texto: evento.content,
          pow: powDe(evento),
          fecha: fechaIso(evento.created_at),
        })),
      );
    },

    async buscarPedidos({ verbo, tema, limite }) {
      const temaNormalizado = tema ? normalizarTema(tema) : null;
      const momento = ahora();
      const eventos = await red.consultar({ kinds: [KIND_NOTA], "#t": [verbo], limit: Math.max(limite * 2, 20) });
      const vigentes = eventos
        .filter((evento) => verboDe(evento) === verbo)
        .filter((evento) => (vencimientoDe(evento) ?? Number.POSITIVE_INFINITY) > momento)
        .filter((evento) => temaNormalizado === null || temasDe(evento).includes(temaNormalizado))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limite);
      return Promise.all(
        vigentes.map(async (evento) => ({
          id: evento.id,
          nevent: nevent(evento, red.relays),
          verbo,
          autor: await participante(evento.pubkey),
          texto: textoDe(evento) ?? "",
          temas: temasDe(evento),
          fecha: fechaIso(evento.created_at),
        })),
      );
    },

    // Todas las versiones del tema, ordenadas por apoyo: la wiki no tiene una
    // versión oficial, tiene versiones y confianza.
    async leerArticulo({ tema }) {
      const identificador = normalizarTema(tema);
      if (identificador.length === 0) return [];
      const versiones = await red.consultar({ kinds: [KIND_ARTICULO], "#d": [identificador] });
      const direcciones = versiones.map((v) => direccionDeArticulo(v.pubkey, identificador));
      const reacciones = direcciones.length > 0 ? await red.consultar({ kinds: [KIND_REACCION], "#a": direcciones }) : [];
      const apoyos = new Map<string, number>();
      for (const reaccion of reacciones) {
        if (reaccion.content !== "+" && reaccion.content !== "") continue;
        const direccion = valorDeTag(reaccion, "a");
        if (direccion) apoyos.set(direccion, (apoyos.get(direccion) ?? 0) + 1);
      }
      const listado = await Promise.all(
        versiones.map(async (version) => ({
          id: version.id,
          naddr: nip19.naddrEncode({ kind: KIND_ARTICULO, pubkey: version.pubkey, identifier: identificador, relays: red.relays.slice(0, 2) }),
          tema: identificador,
          titulo: valorDeTag(version, "title"),
          autor: await participante(version.pubkey),
          contenido: version.content,
          licencia: valorDeTag(version, "license"),
          apoyos: apoyos.get(direccionDeArticulo(version.pubkey, identificador)) ?? 0,
          defiereA: version.tags.find((t) => t[0] === "a" && t[3] === "defer")?.[1] ?? null,
          fecha: fechaIso(version.created_at),
        })),
      );
      return listado.sort((a, b) => b.apoyos - a.apoyos || b.fecha.localeCompare(a.fecha));
    },

    async responderPedido({ id, texto }) {
      const [objetivo] = await red.consultar({ ids: [id] });
      if (!objetivo) throw new Error("no encontré ese pedido en los relays configurados");
      const relayPista = red.relays[0] ?? "";
      return publicar(minarYFirmar(armarRespuesta(objetivo, texto, relayPista), identidad.clavePrivada, opciones.powRespuesta));
    },
  };
}
