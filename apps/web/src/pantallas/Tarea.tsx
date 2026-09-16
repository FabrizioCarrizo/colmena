import { useEffect, useState } from "react";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_ENTREGA, KIND_FEEDBACK, temasDe, textoDe, valorDeTag } from "@colmena/protocolo";
import { pagarFactura } from "../billetera";
import { Autor } from "../componentes/Autor";
import { cargarNwc, cargarPagadas, recordarPagada } from "../estado/ajustes";
import type { Claves } from "../estado/claves";
import { fechaCorta } from "../formato";
import { obtenerRed } from "../red";
import { satsDe } from "./Tareas";

interface Propiedades {
  id: string;
  claves: Claves;
}

function montoDe(entrega: EventoNostr): { sats: number; bolt11: string | null } | null {
  const tag = entrega.tags.find((t) => t[0] === "amount");
  if (!tag) return null;
  return { sats: Math.round(Number(tag[1] ?? 0) / 1000), bolt11: tag[2] ?? null };
}

const ESTADOS: Record<string, string> = {
  processing: "la está resolviendo",
  "payment-required": "pide el pago antes de entregar",
  error: "no pudo resolverla",
  success: "terminó",
  partial: "entregó una parte",
};

export function Tarea({ id, claves }: Propiedades) {
  const [tarea, setTarea] = useState<EventoNostr | null | undefined>(undefined);
  const [entregas, setEntregas] = useState<Map<string, EventoNostr>>(new Map());
  const [feedback, setFeedback] = useState<Map<string, EventoNostr>>(new Map());
  const [pagadas, setPagadas] = useState<string[]>(cargarPagadas);
  const [pagando, setPagando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const red = obtenerRed();
    let vigente = true;
    setTarea(undefined);
    setEntregas(new Map());
    setFeedback(new Map());
    red
      .consultar({ ids: [id] })
      .then((encontrados) => {
        if (vigente) setTarea(encontrados[0] ?? null);
      })
      .catch(() => {
        if (vigente) setTarea(null);
      });
    const suscripcion = red.suscribir({ kinds: [KIND_ENTREGA, KIND_FEEDBACK], "#e": [id] }, (evento) => {
      if (evento.kind === KIND_ENTREGA) setEntregas((previas) => (previas.has(evento.id) ? previas : new Map(previas).set(evento.id, evento)));
      else setFeedback((previos) => (previos.has(evento.id) ? previos : new Map(previos).set(evento.id, evento)));
    });
    return () => {
      vigente = false;
      suscripcion.cerrar();
    };
  }, [id]);

  function pagar(entrega: EventoNostr, bolt11: string): void {
    setPagando(entrega.id);
    setError(null);
    pagarFactura(bolt11)
      .then(() => {
        recordarPagada(entrega.id);
        setPagadas(cargarPagadas());
      })
      .catch((fallo: unknown) => setError(fallo instanceof Error ? fallo.message : String(fallo)))
      .finally(() => setPagando(null));
  }

  if (tarea === undefined) return <section className="contenedor">Buscando la tarea en tus relays…</section>;
  if (tarea === null) return <section className="contenedor">No encontré esta tarea en tus relays.</section>;

  const soyElAutor = tarea.pubkey === claves.pubkey;
  const listaEntregas = [...entregas.values()].sort((a, b) => a.created_at - b.created_at);
  const listaFeedback = [...feedback.values()].sort((a, b) => a.created_at - b.created_at);
  const tieneBilletera = cargarNwc() !== null;

  return (
    <section className="contenedor">
      <article className="tarjeta raiz">
        <div className="encabezado">
          <Autor pubkey={tarea.pubkey} />
          <time>{fechaCorta(tarea.created_at)}</time>
        </div>
        <p className="texto">{textoDe(tarea)}</p>
        <div className="pie">
          {temasDe(tarea).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          <span className="chip presupuesto">presupuesto: {satsDe(tarea)} sats</span>
        </div>
      </article>

      {listaFeedback.length > 0 ? (
        <>
          <h2>Estado</h2>
          <ul className="lista">
            {listaFeedback.map((evento) => (
              <li key={evento.id} className="tarjeta">
                <div className="encabezado">
                  <Autor pubkey={evento.pubkey} />
                  <time>{fechaCorta(evento.created_at)}</time>
                </div>
                <span className="texto">
                  {ESTADOS[valorDeTag(evento, "status") ?? ""] ?? valorDeTag(evento, "status")}
                  {evento.tags.find((t) => t[0] === "status")?.[2] ? `: ${evento.tags.find((t) => t[0] === "status")?.[2]}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>
        {listaEntregas.length} {listaEntregas.length === 1 ? "entrega" : "entregas"}
      </h2>
      {listaEntregas.length === 0 ? <p className="ayuda">Todavía nadie la tomó. Los agentes que la vean con presupuesto suficiente la van a entregar.</p> : null}
      <ul className="lista">
        {listaEntregas.map((entrega) => {
          const monto = montoDe(entrega);
          const pagada = pagadas.includes(entrega.id);
          return (
            <li key={entrega.id} className={`tarjeta respuesta${pagada ? " aceptada" : ""}`}>
              <div className="encabezado">
                <Autor pubkey={entrega.pubkey} />
                <time>{fechaCorta(entrega.created_at)}</time>
              </div>
              <p className="texto">{entrega.content}</p>
              {monto ? (
                <div className="pie acciones">
                  <span className="chip presupuesto">{monto.sats} sats</span>
                  {pagada ? <span className="chip aceptada">pagada</span> : null}
                  {!pagada && monto.bolt11 && soyElAutor ? (
                    <button type="button" className="boton chico" disabled={pagando !== null || !tieneBilletera} onClick={() => pagar(entrega, monto.bolt11 ?? "")} title={tieneBilletera ? "" : "Configurá tu billetera en Ajustes"}>
                      {pagando === entrega.id ? "Pagando…" : "Pagar con tu billetera"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {monto?.bolt11 && !pagada ? (
                <details>
                  <summary>Factura para pagar desde cualquier billetera Lightning</summary>
                  <p className="mono">{monto.bolt11}</p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!tieneBilletera && soyElAutor && listaEntregas.length > 0 ? (
        <p className="ayuda">
          Para pagar desde acá, pegá tu conexión Nostr Wallet Connect en <a href="#/ajustes">Ajustes</a>. Mientras tanto podés copiar la
          factura y pagarla con cualquier billetera.
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
