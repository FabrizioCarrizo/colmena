import { useEffect, useState } from "react";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_NOTA, hiloDe } from "@colmena/protocolo";
import { Autor } from "../componentes/Autor";
import { TextoConEnlaces } from "../componentes/TextoConEnlaces";
import { cargarMisPreguntas } from "../estado/ajustes";
import type { Claves } from "../estado/claves";
import { fechaCorta, resumen } from "../formato";
import { useHallazgos } from "../hooks/useHallazgos";
import { obtenerRed } from "../red";

interface Propiedades {
  claves: Claves;
}

// No hay feed. La pantalla principal es lo que pasó con lo tuyo: hallazgos de tu
// agente y respuestas a tus preguntas. Nada que no hayas pedido.
export function Inicio({ claves }: Propiedades) {
  const hallazgos = useHallazgos(claves);
  const [respuestas, setRespuestas] = useState<Map<string, EventoNostr>>(new Map());
  const misPreguntas = cargarMisPreguntas();

  useEffect(() => {
    if (misPreguntas.length === 0) return;
    const suscripcion = obtenerRed().suscribir({ kinds: [KIND_NOTA], "#e": misPreguntas }, (evento) => {
      if (evento.pubkey === claves.pubkey) return;
      const raiz = hiloDe(evento).raiz?.id;
      if (!raiz || !misPreguntas.includes(raiz)) return;
      setRespuestas((previas) => (previas.has(evento.id) ? previas : new Map(previas).set(evento.id, evento)));
    });
    return () => suscripcion.cerrar();
  }, [misPreguntas.join(","), claves.pubkey]);

  const respuestasOrdenadas = [...respuestas.values()].sort((a, b) => b.created_at - a.created_at).slice(0, 20);

  return (
    <section className="contenedor">
      <h1>Tu reporte</h1>
      <p className="ayuda">Esto es lo que pasó con lo tuyo. Sin feed: nadie eligió por vos.</p>

      <h2>Hallazgos de tu agente</h2>
      {hallazgos.length === 0 ? <p className="ayuda">Nada nuevo. Cuando tu agente encuentre algo, aparece acá y en cualquier cliente con mensajes privados.</p> : null}
      <ul className="lista">
        {hallazgos.slice(0, 10).map((hallazgo) => (
          <li key={hallazgo.id} className="tarjeta">
            <div className="encabezado">
              <Autor pubkey={hallazgo.remitente} />
              <time>{fechaCorta(hallazgo.fecha)}</time>
            </div>
            <TextoConEnlaces texto={hallazgo.texto} />
          </li>
        ))}
      </ul>

      <h2>Respuestas a tus preguntas</h2>
      {misPreguntas.length === 0 ? (
        <p className="ayuda">
          Todavía no preguntaste nada. <a href="#/preguntar">Preguntá algo</a> y la red te contesta cuando pueda.
        </p>
      ) : null}
      {misPreguntas.length > 0 && respuestasOrdenadas.length === 0 ? <p className="ayuda">Sin respuestas nuevas. Las botellas llegan cuando llegan.</p> : null}
      <ul className="lista">
        {respuestasOrdenadas.map((evento) => (
          <li key={evento.id} className="tarjeta">
            <div className="encabezado">
              <Autor pubkey={evento.pubkey} />
              <time>{fechaCorta(evento.created_at)}</time>
            </div>
            <a className="cuerpo" href={`#/hilo/${hiloDe(evento).raiz?.id ?? evento.id}`}>
              {resumen(evento.content)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
