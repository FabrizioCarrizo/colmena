import { SimplePool } from "nostr-tools/pool";
import type { Filter } from "nostr-tools/filter";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_NOTA, KIND_PERFIL } from "@colmena/protocolo";

export interface ResultadoPublicacion {
  exitos: string[];
  fallos: { relay: string; motivo: string }[];
}

export interface Suscripcion {
  cerrar(): void;
}

export interface OpcionesSuscripcion {
  relays?: string[];
  alFinDeHistoria?: () => void;
}

export interface OpcionesEspera {
  relays?: string[];
  // Resuelve antes de tiempo cuando junta esta cantidad de respuestas.
  minimo?: number;
}

export interface Red {
  relays: string[];
  publicar(evento: EventoNostr, relays?: string[]): Promise<ResultadoPublicacion>;
  suscribir(filtro: Filter, alEvento: (evento: EventoNostr) => void, opciones?: OpcionesSuscripcion): Suscripcion;
  consultar(filtro: Filter, relays?: string[]): Promise<EventoNostr[]>;
  esperarRespuestas(id: string, hastaSeg: number, opciones?: OpcionesEspera): Promise<EventoNostr[]>;
  perfilDe(pubkey: string, relays?: string[]): Promise<EventoNostr | null>;
  cerrar(): void;
}

// Capa fina sobre SimplePool para que agente, MCP y web compartan la misma forma
// de hablar con los relays. Sin lógica de negocio: eso vive en protocolo y en los
// oficios.
export function crearRed(relays: string[]): Red {
  const pool = new SimplePool();
  pool.trackRelays = false;
  const cachePerfiles = new Map<string, EventoNostr | null>();

  return {
    relays,

    async publicar(evento, destino = relays) {
      const resultados = await Promise.allSettled(pool.publish(destino, evento).map((promesa) => promesa.catch((motivo: unknown) => Promise.reject(new Error(String(motivo))))));
      const exitos: string[] = [];
      const fallos: { relay: string; motivo: string }[] = [];
      resultados.forEach((resultado, indice) => {
        const relay = destino[indice] ?? "desconocido";
        if (resultado.status === "fulfilled") exitos.push(relay);
        else fallos.push({ relay, motivo: String(resultado.reason) });
      });
      return { exitos, fallos };
    },

    suscribir(filtro, alEvento, opciones = {}) {
      const cerrador = pool.subscribe(opciones.relays ?? relays, filtro, {
        onevent: alEvento,
        oneose: opciones.alFinDeHistoria,
      });
      return { cerrar: () => cerrador.close() };
    },

    consultar(filtro, destino = relays) {
      return pool.querySync(destino, filtro);
    },

    esperarRespuestas(id, hastaSeg, opciones = {}) {
      return new Promise((resolver) => {
        const vistas = new Map<string, EventoNostr>();
        let terminado = false;
        const terminar = (): void => {
          if (terminado) return;
          terminado = true;
          clearTimeout(temporizador);
          cerrador.close();
          resolver([...vistas.values()].sort((a, b) => a.created_at - b.created_at));
        };
        const cerrador = pool.subscribe(
          opciones.relays ?? relays,
          { kinds: [KIND_NOTA], "#e": [id] },
          {
            onevent: (evento) => {
              vistas.set(evento.id, evento);
              if (opciones.minimo !== undefined && vistas.size >= opciones.minimo) terminar();
            },
          },
        );
        const temporizador = setTimeout(terminar, hastaSeg * 1000);
      });
    },

    async perfilDe(pubkey, destino = relays) {
      const cacheado = cachePerfiles.get(pubkey);
      if (cacheado !== undefined) return cacheado;
      const perfil = await pool.get(destino, { kinds: [KIND_PERFIL], authors: [pubkey] });
      cachePerfiles.set(pubkey, perfil);
      return perfil;
    },

    cerrar() {
      pool.close(relays);
    },
  };
}
