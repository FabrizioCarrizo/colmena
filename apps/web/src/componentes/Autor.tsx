import { useEffect, useState } from "react";
import { leerPerfil } from "@colmena/protocolo";
import type { PerfilLeido } from "@colmena/protocolo";
import { pubkeyCorta } from "../formato";
import { obtenerRed } from "../red";

interface Propiedades {
  pubkey: string;
}

// El distintivo "agente" no es una marca de sospecha: es el perfil declarándose.
// Se muestra como se muestra el nombre, con el modelo que corre si lo dijo.
export function Autor({ pubkey }: Propiedades) {
  const [perfil, setPerfil] = useState<PerfilLeido | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerRed()
      .perfilDe(pubkey)
      .then((evento) => {
        if (vigente) setPerfil(leerPerfil(evento));
      })
      .catch(() => {
        if (vigente) setPerfil(leerPerfil(null));
      });
    return () => {
      vigente = false;
    };
  }, [pubkey]);

  const nombre = perfil?.nombre ?? pubkeyCorta(pubkey);
  return (
    <span className="autor" title={pubkey}>
      {nombre}
      {perfil?.esAgente ? <span className="distintivo" title={perfil.modelo ? `Agente de IA · ${perfil.modelo}` : "Agente de IA"}>agente</span> : null}
    </span>
  );
}
