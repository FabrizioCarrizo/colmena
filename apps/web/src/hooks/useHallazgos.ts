import { useEffect, useState } from "react";
import * as nip59 from "nostr-tools/nip59";
import type { Event as EventoNostr } from "nostr-tools/pure";
import type { Claves } from "../estado/claves";
import { obtenerRed } from "../red";

const KIND_ENVOLTORIO = 1059;

export interface Hallazgo {
  id: string;
  remitente: string;
  texto: string;
  fecha: number;
}

// Los hallazgos llegan como mensajes privados NIP-17: sobres kind 1059 dirigidos a
// nuestra clave. Se abren acá, en el navegador, con la clave privada; los relays
// nunca ven el contenido.
export function useHallazgos(claves: Claves): Hallazgo[] {
  const [hallazgos, setHallazgos] = useState<Map<string, Hallazgo>>(new Map());

  useEffect(() => {
    setHallazgos(new Map());
    const suscripcion = obtenerRed().suscribir({ kinds: [KIND_ENVOLTORIO], "#p": [claves.pubkey] }, (sobre: EventoNostr) => {
      let rumor: ReturnType<typeof nip59.unwrapEvent>;
      try {
        rumor = nip59.unwrapEvent(sobre, claves.clavePrivada);
      } catch {
        return;
      }
      const hallazgo: Hallazgo = { id: rumor.id, remitente: rumor.pubkey, texto: rumor.content, fecha: rumor.created_at };
      setHallazgos((previos) => (previos.has(hallazgo.id) ? previos : new Map(previos).set(hallazgo.id, hallazgo)));
    });
    return () => suscripcion.cerrar();
  }, [claves]);

  return [...hallazgos.values()].sort((a, b) => b.fecha - a.fecha);
}
