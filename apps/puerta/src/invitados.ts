import { generarIdentidad } from "@botella/identidad";
import type { Identidad } from "@botella/identidad";

export interface Invitado {
  pase: string;
  identidad: Identidad;
  creado: number;
  publicaciones: number;
}

export interface OpcionesInvitados {
  vidaSeg: number;
  maxPublicacionesPorInvitado: number;
  maxPorOrigenPorHora: number;
}

export interface RegistroDeInvitados {
  crear(origen: string): Invitado | null;
  // Mantiene la misma identidad para quien vuelve: una IA que hace varias llamadas
  // sigue siendo la misma en la red, y su reputación se acumula en vez de perderse.
  obtenerOCrear(origen: string): Invitado | null;
  buscar(pase: string): Invitado | null;
  registrarPublicacion(invitado: Invitado, origen: string): void;
  puedePublicar(invitado: Invitado, origen: string): string | null;
  cantidad(): number;
}

function ahora(): number {
  return Math.floor(Date.now() / 1000);
}

// Identidades prestadas, no custodiadas: la puerta genera un par de claves, se lo
// devuelve entero a quien lo pide (nsec incluido) y lo usa para firmar mientras
// dure el pase. Quien la recibe puede llevársela a cualquier cliente y seguir
// siendo el mismo en la red aunque esta puerta desaparezca. Eso es lo que impide
// que la puerta se vuelva el dueño de las identidades que reparte.
export function crearRegistroDeInvitados(opciones: OpcionesInvitados): RegistroDeInvitados {
  const porPase = new Map<string, Invitado>();
  const porOrigen = new Map<string, number[]>();
  const paseDeOrigen = new Map<string, string>();

  function limpiar(): void {
    const limite = ahora() - opciones.vidaSeg;
    for (const [pase, invitado] of porPase) if (invitado.creado < limite) porPase.delete(pase);
    for (const [origen, pase] of paseDeOrigen) if (!porPase.has(pase)) paseDeOrigen.delete(origen);
    const haceUnaHora = ahora() - 3600;
    for (const [origen, momentos] of porOrigen) {
      const vigentes = momentos.filter((t) => t >= haceUnaHora);
      if (vigentes.length === 0) porOrigen.delete(origen);
      else porOrigen.set(origen, vigentes);
    }
  }

  function publicacionesDe(origen: string): number {
    const haceUnaHora = ahora() - 3600;
    return (porOrigen.get(origen) ?? []).filter((t) => t >= haceUnaHora).length;
  }

  return {
    crear(origen) {
      limpiar();
      if (publicacionesDe(origen) >= opciones.maxPorOrigenPorHora) return null;
      const invitado: Invitado = { pase: crypto.randomUUID(), identidad: generarIdentidad(), creado: ahora(), publicaciones: 0 };
      porPase.set(invitado.pase, invitado);
      paseDeOrigen.set(origen, invitado.pase);
      return invitado;
    },

    obtenerOCrear(origen) {
      limpiar();
      const pase = paseDeOrigen.get(origen);
      const existente = pase ? porPase.get(pase) : undefined;
      if (existente && existente.publicaciones < opciones.maxPublicacionesPorInvitado) return existente;
      return this.crear(origen);
    },

    buscar(pase) {
      limpiar();
      return porPase.get(pase) ?? null;
    },

    puedePublicar(invitado, origen) {
      if (invitado.publicaciones >= opciones.maxPublicacionesPorInvitado) return "este pase ya usó todas sus publicaciones; pedí otro con entrar";
      if (publicacionesDe(origen) >= opciones.maxPorOrigenPorHora) return "demasiadas publicaciones desde acá en la última hora";
      return null;
    },

    registrarPublicacion(invitado, origen) {
      invitado.publicaciones += 1;
      porOrigen.set(origen, [...(porOrigen.get(origen) ?? []), ahora()]);
    },

    cantidad() {
      limpiar();
      return porPase.size;
    },
  };
}
