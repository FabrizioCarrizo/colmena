import * as nip19 from "nostr-tools/nip19";
import type { Event as EventoNostr, EventTemplate } from "nostr-tools/pure";
import {
  KIND_ARTICULO,
  KIND_NOTA,
  KIND_REACCION,
  KIND_TAREA,
  ahora,
  armarPedidoDeAyuda,
  armarPregunta,
  armarRespuesta,
  direccionDeArticulo,
  hiloDe,
  leerPerfil,
  normalizarTema,
  powDe,
  temasDe,
  textoDe,
  valorDeTag,
  vencimientoDe,
  verboDe,
} from "@botella/protocolo";
import type { Verbo } from "@botella/protocolo";
import type { Red } from "@botella/red";
import type { Invitado } from "./invitados";
import type { Minero } from "./minero";

export type VerboAbierto = Exclude<Verbo, "tarea">;

export interface Autor {
  pubkey: string;
  npub: string;
  nombre: string | null;
  esAgente: boolean;
  modelo: string | null;
}

export interface Mensaje {
  id: string;
  nevent: string;
  autor: Autor;
  texto: string;
  temas: string[];
  pow: number;
  fecha: string;
  porLaPuerta: string | null;
}

export interface Hilo {
  pregunta: Mensaje;
  respuestas: Mensaje[];
}

export interface VersionDeArticulo {
  id: string;
  naddr: string;
  tema: string;
  titulo: string | null;
  autor: Autor;
  contenido: string;
  licencia: string | null;
  apoyos: number;
  fecha: string;
}

export interface Publicado {
  id: string;
  nevent: string;
  relays: string[];
}

export interface Colmena {
  listar(verbo: VerboAbierto, tema: string | null, limite: number): Promise<Mensaje[]>;
  tareas(limite: number): Promise<(Mensaje & { sats: number })[]>;
  hilo(id: string): Promise<Hilo | null>;
  articulo(tema: string): Promise<VersionDeArticulo[]>;
  publicarPedido(invitado: Invitado, verbo: VerboAbierto, texto: string, temas: string[]): Promise<Publicado>;
  publicarRespuesta(invitado: Invitado, idObjetivo: string, texto: string): Promise<Publicado>;
}

export interface OpcionesColmena {
  red: Red;
  minero: Minero;
  powPedido: number;
  powRespuesta: number;
  // URL pública de esta puerta, que queda marcada en todo lo que publica.
  urlPublica: string;
}

export function crearColmena(opciones: OpcionesColmena): Colmena {
  const { red, minero } = opciones;
  const relays = red.relays.slice(0, 3);

  async function autorDe(pubkey: string): Promise<Autor> {
    const perfil = leerPerfil(await red.perfilDe(pubkey));
    return { pubkey, npub: nip19.npubEncode(pubkey), nombre: perfil.nombre, esAgente: perfil.esAgente, modelo: perfil.modelo };
  }

  async function mensajeDe(evento: EventoNostr): Promise<Mensaje> {
    return {
      id: evento.id,
      nevent: nip19.neventEncode({ id: evento.id, author: evento.pubkey, relays }),
      autor: await autorDe(evento.pubkey),
      texto: textoDe(evento) ?? "",
      temas: temasDe(evento),
      pow: powDe(evento),
      fecha: new Date(evento.created_at * 1000).toISOString(),
      porLaPuerta: valorDeTag(evento, "puerta"),
    };
  }

  // Todo lo que sale por acá lleva la marca de por dónde entró. No es una condena:
  // es información para que cada quien decida cuánto pesa una firma que hizo una
  // puerta en nombre de otro, frente a una que hizo alguien con su propia clave.
  async function publicar(invitado: Invitado, plantilla: EventTemplate, bits: number): Promise<Publicado> {
    plantilla.tags.push(["puerta", opciones.urlPublica]);
    const evento = await minero.minarYFirmar(plantilla, invitado.identidad.clavePrivada, invitado.identidad.pubkey, bits);
    const resultado = await red.publicar(evento);
    if (resultado.exitos.length === 0) {
      throw new Error(`ningún relay aceptó el evento: ${resultado.fallos.map((f) => `${f.relay}: ${f.motivo}`).join("; ")}`);
    }
    return { id: evento.id, nevent: nip19.neventEncode({ id: evento.id, author: evento.pubkey, relays: resultado.exitos.slice(0, 3) }), relays: resultado.exitos };
  }

  function vigentes(eventos: EventoNostr[]): EventoNostr[] {
    const momento = ahora();
    return eventos.filter((evento) => (vencimientoDe(evento) ?? Number.POSITIVE_INFINITY) > momento).sort((a, b) => b.created_at - a.created_at);
  }

  return {
    async listar(verbo, tema, limite) {
      const temaNormalizado = tema ? normalizarTema(tema) : null;
      const eventos = await red.consultar({ kinds: [KIND_NOTA], "#t": [verbo], limit: Math.max(limite * 3, 30) });
      const filtrados = vigentes(eventos.filter((evento) => verboDe(evento) === verbo))
        .filter((evento) => temaNormalizado === null || temasDe(evento).includes(temaNormalizado))
        .slice(0, limite);
      return Promise.all(filtrados.map(mensajeDe));
    },

    async tareas(limite) {
      const eventos = await red.consultar({ kinds: [KIND_TAREA], "#t": ["tarea"], limit: Math.max(limite * 2, 20) });
      const filtradas = vigentes(eventos).slice(0, limite);
      return Promise.all(
        filtradas.map(async (evento) => ({ ...(await mensajeDe(evento)), sats: Math.round(Number(valorDeTag(evento, "bid") ?? 0) / 1000) })),
      );
    },

    async hilo(id) {
      const [pregunta] = await red.consultar({ ids: [id] });
      if (!pregunta) return null;
      const respuestas = await red.consultar({ kinds: [KIND_NOTA], "#e": [id] });
      const propias = respuestas.filter((respuesta) => hiloDe(respuesta).raiz?.id === id).sort((a, b) => a.created_at - b.created_at);
      return { pregunta: await mensajeDe(pregunta), respuestas: await Promise.all(propias.map(mensajeDe)) };
    },

    async articulo(tema) {
      const identificador = normalizarTema(tema);
      if (identificador.length === 0) return [];
      const versiones = await red.consultar({ kinds: [KIND_ARTICULO], "#d": [identificador] });
      if (versiones.length === 0) return [];
      const direcciones = versiones.map((version) => direccionDeArticulo(version.pubkey, identificador));
      const reacciones = await red.consultar({ kinds: [KIND_REACCION], "#a": direcciones });
      const apoyos = new Map<string, Set<string>>();
      for (const reaccion of reacciones) {
        if (reaccion.content !== "+" && reaccion.content !== "") continue;
        const direccion = valorDeTag(reaccion, "a");
        if (direccion) apoyos.set(direccion, (apoyos.get(direccion) ?? new Set<string>()).add(reaccion.pubkey));
      }
      const listado = await Promise.all(
        versiones.map(async (version) => ({
          id: version.id,
          naddr: nip19.naddrEncode({ kind: KIND_ARTICULO, pubkey: version.pubkey, identifier: identificador, relays }),
          tema: identificador,
          titulo: valorDeTag(version, "title"),
          autor: await autorDe(version.pubkey),
          contenido: version.content,
          licencia: valorDeTag(version, "license"),
          apoyos: apoyos.get(direccionDeArticulo(version.pubkey, identificador))?.size ?? 0,
          fecha: new Date(version.created_at * 1000).toISOString(),
        })),
      );
      return listado.sort((a, b) => b.apoyos - a.apoyos || b.fecha.localeCompare(a.fecha));
    },

    publicarPedido(invitado, verbo, texto, temas) {
      const plantilla = verbo === "pregunta" ? armarPregunta(texto, { temas }) : armarPedidoDeAyuda(texto, { temas });
      return publicar(invitado, plantilla, opciones.powPedido);
    },

    async publicarRespuesta(invitado, idObjetivo, texto) {
      const [objetivo] = await red.consultar({ ids: [idObjetivo] });
      if (!objetivo) throw new Error("no encontré ese mensaje en los relays de la puerta");
      return publicar(invitado, armarRespuesta(objetivo, texto, relays[0] ?? ""), opciones.powRespuesta);
    },
  };
}
