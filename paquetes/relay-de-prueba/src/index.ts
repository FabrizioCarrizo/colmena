import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { verifyEvent } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { matchFilters } from "nostr-tools/filter";
import type { Filter } from "nostr-tools/filter";

export interface RelayDePrueba {
  url: string;
  puerto: number;
  eventos(): EventoNostr[];
  cerrar(): Promise<void>;
}

// Relay NIP-01 mínimo, en memoria, para desarrollo y tests. No es un relay de
// producción: no persiste, no autentica, no limita. Existe para no depender de
// Docker ni de relays públicos mientras se construye la red.
export function iniciarRelayDePrueba(puerto = 0): Promise<RelayDePrueba> {
  return new Promise((resolver, rechazar) => {
    const servidor = new WebSocketServer({ port: puerto, host: "127.0.0.1" });
    const almacen = new Map<string, EventoNostr>();
    const vigentes = new Map<string, string>();
    const suscripciones = new Map<WebSocket, Map<string, Filter[]>>();

    servidor.on("error", rechazar);
    servidor.on("listening", () => {
      const direccion = servidor.address();
      const puertoReal = typeof direccion === "object" && direccion !== null ? direccion.port : puerto;
      resolver({
        url: `ws://127.0.0.1:${puertoReal}`,
        puerto: puertoReal,
        eventos: () => [...almacen.values()],
        cerrar: () =>
          new Promise((listo) => {
            for (const cliente of servidor.clients) cliente.terminate();
            servidor.close(() => listo());
          }),
      });
    });

    servidor.on("connection", (socket) => {
      suscripciones.set(socket, new Map());
      socket.on("message", (datos) => manejar(socket, datos));
      socket.on("close", () => suscripciones.delete(socket));
    });

    function enviar(socket: WebSocket, mensaje: unknown[]): void {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensaje));
    }

    function manejar(socket: WebSocket, datos: RawData): void {
      let mensaje: unknown;
      try {
        mensaje = JSON.parse(datos.toString());
      } catch {
        enviar(socket, ["NOTICE", "error: mensaje que no es JSON"]);
        return;
      }
      if (!Array.isArray(mensaje)) {
        enviar(socket, ["NOTICE", "error: se esperaba un arreglo"]);
        return;
      }
      const [tipo, ...resto] = mensaje;
      const subs = suscripciones.get(socket);
      if (!subs) return;
      switch (tipo) {
        case "EVENT": {
          const evento = resto[0];
          if (!esEvento(evento)) {
            enviar(socket, ["NOTICE", "error: evento con forma inválida"]);
            return;
          }
          if (!verifyEvent(evento)) {
            enviar(socket, ["OK", evento.id, false, "invalid: firma o id inválidos"]);
            return;
          }
          const guardado = guardar(evento);
          enviar(socket, ["OK", evento.id, true, guardado ? "" : "duplicate: ya existía o hay una versión más nueva"]);
          if (guardado) difundir(evento);
          return;
        }
        case "REQ": {
          const [id, ...filtros] = resto;
          if (typeof id !== "string" || filtros.length === 0 || !filtros.every(esFiltro)) {
            enviar(socket, ["NOTICE", "error: REQ inválido"]);
            return;
          }
          subs.set(id, filtros);
          for (const evento of coincidencias(filtros)) enviar(socket, ["EVENT", id, evento]);
          enviar(socket, ["EOSE", id]);
          return;
        }
        case "CLOSE": {
          const id = resto[0];
          if (typeof id === "string") subs.delete(id);
          return;
        }
        default:
          enviar(socket, ["NOTICE", `error: mensaje desconocido ${String(tipo)}`]);
      }
    }

    // Los kinds reemplazables (0, 3, 10000-19999) y direccionables (30000-39999)
    // guardan una sola versión por autor, como hace cualquier relay real.
    function claveReemplazable(evento: EventoNostr): string | null {
      const { kind, pubkey } = evento;
      if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) return `${kind}:${pubkey}`;
      if (kind >= 30000 && kind < 40000) {
        const d = evento.tags.find((t) => t[0] === "d")?.[1] ?? "";
        return `${kind}:${pubkey}:${d}`;
      }
      return null;
    }

    function guardar(evento: EventoNostr): boolean {
      if (almacen.has(evento.id)) return false;
      const clave = claveReemplazable(evento);
      if (clave !== null) {
        const idVigente = vigentes.get(clave);
        const vigente = idVigente ? almacen.get(idVigente) : undefined;
        if (vigente && vigente.created_at >= evento.created_at) return false;
        if (idVigente) almacen.delete(idVigente);
        vigentes.set(clave, evento.id);
      }
      almacen.set(evento.id, evento);
      return true;
    }

    function coincidencias(filtros: Filter[]): EventoNostr[] {
      const limites = filtros.map((f) => f.limit).filter((l): l is number => typeof l === "number");
      const limite = limites.length > 0 ? Math.max(...limites) : Number.POSITIVE_INFINITY;
      return [...almacen.values()]
        .filter((evento) => matchFilters(filtros, evento))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limite);
    }

    function difundir(evento: EventoNostr): void {
      for (const [socket, subs] of suscripciones) {
        for (const [id, filtros] of subs) {
          if (matchFilters(filtros, evento)) enviar(socket, ["EVENT", id, evento]);
        }
      }
    }
  });
}

function esEvento(valor: unknown): valor is EventoNostr {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.id === "string" &&
    typeof registro.pubkey === "string" &&
    typeof registro.sig === "string" &&
    typeof registro.kind === "number" &&
    typeof registro.content === "string" &&
    typeof registro.created_at === "number" &&
    Array.isArray(registro.tags) &&
    registro.tags.every((tag) => Array.isArray(tag) && tag.every((campo) => typeof campo === "string"))
  );
}

function esFiltro(valor: unknown): valor is Filter {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export { iniciarBlossomDePrueba } from "./blossom";
export type { BlossomDePrueba } from "./blossom";
