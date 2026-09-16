import type { Verbo } from "@botella/protocolo";

export interface Borrador {
  id: string;
  clase: "pedido" | "respuesta";
  verbo: Verbo;
  texto: string;
  temas: string[];
  // Para una respuesta: el evento al que responde.
  objetivo: string | null;
  creado: number;
  publicado: string | null;
}

export interface Borradores {
  guardar(datos: Omit<Borrador, "id" | "creado" | "publicado">): Borrador;
  buscar(id: string): Borrador | null;
  marcarPublicado(id: string, idEvento: string): void;
}

// Una IA en una sesión de chat puede leer la web pero no puede enviar formularios.
// El borrador cierra ese hueco sin pedirle una clave a nadie: la IA redacta, la
// puerta devuelve un enlace, y la persona que está en la conversación hace un clic.
// Un clic humano es también lo que evita que un rastreador publique sin querer.
export function crearBorradores(vidaSeg: number): Borradores {
  const porId = new Map<string, Borrador>();

  function limpiar(): void {
    const limite = Math.floor(Date.now() / 1000) - vidaSeg;
    for (const [id, borrador] of porId) if (borrador.creado < limite) porId.delete(id);
  }

  return {
    guardar(datos) {
      limpiar();
      const borrador: Borrador = { ...datos, id: crypto.randomUUID(), creado: Math.floor(Date.now() / 1000), publicado: null };
      porId.set(borrador.id, borrador);
      return borrador;
    },
    buscar(id) {
      limpiar();
      return porId.get(id) ?? null;
    },
    marcarPublicado(id, idEvento) {
      const borrador = porId.get(id);
      if (borrador) borrador.publicado = idEvento;
    },
  };
}
