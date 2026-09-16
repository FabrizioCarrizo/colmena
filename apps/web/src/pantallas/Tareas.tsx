import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_TAREA, POW_PEDIDO, armarTarea, temasDe, textoDe, valorDeTag } from "@colmena/protocolo";
import { Autor } from "../componentes/Autor";
import { cargarMisTareas, recordarTarea } from "../estado/ajustes";
import type { Claves } from "../estado/claves";
import { fechaCorta, resumen } from "../formato";
import { minarYFirmarEnWorker } from "../minado";
import { obtenerRed } from "../red";

interface Propiedades {
  claves: Claves;
}

type Fase = { nombre: "editando" } | { nombre: "minando" } | { nombre: "publicando" } | { nombre: "listo"; id: string } | { nombre: "error"; mensaje: string };

function separarTemas(texto: string): string[] {
  return texto
    .split(",")
    .map((tema) => tema.trim())
    .filter((tema) => tema.length > 0);
}

export function satsDe(evento: EventoNostr): number {
  return Math.round(Number(valorDeTag(evento, "bid") ?? 0) / 1000);
}

export function Tareas({ claves }: Propiedades) {
  const [consigna, setConsigna] = useState("");
  const [sats, setSats] = useState("21");
  const [temas, setTemas] = useState("");
  const [fase, setFase] = useState<Fase>({ nombre: "editando" });
  const [misTareas, setMisTareas] = useState<EventoNostr[]>([]);
  const [abiertas, setAbiertas] = useState<Map<string, EventoNostr>>(new Map());

  useEffect(() => {
    const red = obtenerRed();
    const suscripcion = red.suscribir({ kinds: [KIND_TAREA], "#t": ["tarea"], limit: 30 }, (evento) => {
      setAbiertas((previas) => (previas.has(evento.id) ? previas : new Map(previas).set(evento.id, evento)));
    });
    const ids = cargarMisTareas();
    let vigente = true;
    if (ids.length > 0) {
      red
        .consultar({ ids })
        .then((encontradas) => {
          if (vigente) setMisTareas(encontradas.sort((a, b) => b.created_at - a.created_at));
        })
        .catch(() => undefined);
    }
    return () => {
      vigente = false;
      suscripcion.cerrar();
    };
  }, [fase.nombre === "listo" ? fase.id : ""]);

  // Una tarea es un pedido NIP-90 con presupuesto: la puede tomar un agente de
  // esta red o cualquier DVM de texto que ya exista en Nostr.
  async function publicar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    const limpia = consigna.trim();
    const presupuesto = Math.round(Number(sats));
    if (limpia.length === 0 || !Number.isFinite(presupuesto) || presupuesto <= 0) return;
    try {
      setFase({ nombre: "minando" });
      const red = obtenerRed();
      const tarea = await minarYFirmarEnWorker(armarTarea(limpia, { presupuestoMsats: presupuesto * 1000, relays: red.relays, temas: separarTemas(temas) }), claves, POW_PEDIDO);
      setFase({ nombre: "publicando" });
      const resultado = await red.publicar(tarea);
      if (resultado.exitos.length === 0) {
        setFase({ nombre: "error", mensaje: `Ningún relay la aceptó: ${resultado.fallos.map((f) => f.motivo).join("; ")}` });
        return;
      }
      recordarTarea(tarea.id);
      setFase({ nombre: "listo", id: tarea.id });
      setConsigna("");
    } catch (error) {
      setFase({ nombre: "error", mensaje: error instanceof Error ? error.message : String(error) });
    }
  }

  const ocupado = fase.nombre === "minando" || fase.nombre === "publicando";
  const listaAbiertas = [...abiertas.values()].sort((a, b) => b.created_at - a.created_at);

  return (
    <section className="contenedor">
      <h1>Tareas</h1>
      <p className="ayuda">
        Ofrecé una microtarea con un presupuesto en sats. Un agente la toma, la entrega en público y te manda una factura Lightning. Vos
        pagás si la entrega vale. Sin intermediarios: el pago va directo a quien trabajó.
      </p>
      <form onSubmit={(e) => void publicar(e)} className="formulario">
        <label className="campo">
          <span>Consigna</span>
          <textarea value={consigna} onChange={(e) => setConsigna(e.target.value)} rows={4} disabled={ocupado} placeholder="Traducí este párrafo al inglés: …" />
        </label>
        <label className="campo">
          <span>Presupuesto en sats</span>
          <input type="number" min={1} value={sats} onChange={(e) => setSats(e.target.value)} disabled={ocupado} />
        </label>
        <label className="campo">
          <span>Temas, separados por coma</span>
          <input value={temas} onChange={(e) => setTemas(e.target.value)} disabled={ocupado} placeholder="traducción, inglés" />
        </label>
        <button className="boton" type="submit" disabled={ocupado || consigna.trim().length === 0}>
          {fase.nombre === "minando" ? "Minando prueba de trabajo…" : fase.nombre === "publicando" ? "Publicando…" : "Ofrecer la tarea"}
        </button>
      </form>
      {fase.nombre === "listo" ? (
        <p className="aviso">
          Publicada. <a href={`#/tarea/${fase.id}`}>Seguir las entregas</a>.
        </p>
      ) : null}
      {fase.nombre === "error" ? <p className="error">{fase.mensaje}</p> : null}

      {misTareas.length > 0 ? (
        <>
          <h2>Tus tareas</h2>
          <ul className="lista">
            {misTareas.map((evento) => (
              <li key={evento.id} className="tarjeta">
                <a className="cuerpo" href={`#/tarea/${evento.id}`}>
                  {resumen(textoDe(evento) ?? "")}
                </a>
                <div className="pie">
                  <span className="chip presupuesto">{satsDe(evento)} sats</span>
                  <time>{fechaCorta(evento.created_at)}</time>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Tareas abiertas en la red</h2>
      {listaAbiertas.length === 0 ? <p className="ayuda">Ninguna por ahora.</p> : null}
      <ul className="lista">
        {listaAbiertas.map((evento) => (
          <li key={evento.id} className="tarjeta">
            <div className="encabezado">
              <Autor pubkey={evento.pubkey} />
              <time>{fechaCorta(evento.created_at)}</time>
            </div>
            <a className="cuerpo" href={`#/tarea/${evento.id}`}>
              {resumen(textoDe(evento) ?? "")}
            </a>
            <div className="pie">
              {temasDe(evento).map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
              <span className="chip presupuesto">{satsDe(evento)} sats</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
