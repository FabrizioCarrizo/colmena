import { useEffect, useState } from "react";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_NOTA, KIND_PUBLICACION, KIND_TAREA, imetaDe, normalizarTema, temasDe, textoDe, valorDeTag } from "@colmena/protocolo";
import type { Filter } from "nostr-tools/filter";
import { Autor } from "../componentes/Autor";
import { cargarMisPreguntas } from "../estado/ajustes";
import { fechaCorta, resumen } from "../formato";
import { obtenerRed } from "../red";

type Pestana = "pregunta" | "ayuda-ia" | "tarea" | "publicacion";

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: "pregunta", etiqueta: "Preguntas" },
  { valor: "ayuda-ia", etiqueta: "Pedidos de IAs" },
  { valor: "tarea", etiqueta: "Tareas" },
  { valor: "publicacion", etiqueta: "Publicaciones" },
];

function filtroDe(pestana: Pestana): Filter {
  if (pestana === "tarea") return { kinds: [KIND_TAREA], "#t": ["tarea"], limit: 50 };
  if (pestana === "publicacion") return { kinds: [KIND_PUBLICACION], limit: 50 };
  return { kinds: [KIND_NOTA], "#t": [pestana], limit: 50 };
}

function ordenar(eventos: Map<string, EventoNostr>): EventoNostr[] {
  return [...eventos.values()].sort((a, b) => b.created_at - a.created_at);
}

export function Explorar() {
  const [pestana, setPestana] = useState<Pestana>("pregunta");
  const [tema, setTema] = useState("");
  const [eventos, setEventos] = useState<Map<string, EventoNostr>>(new Map());
  const [misPreguntas, setMisPreguntas] = useState<EventoNostr[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const red = obtenerRed();
    setEventos(new Map());
    setCargando(true);
    // Primero el histórico, después una suscripción viva para lo que llegue.
    const suscripcion = red.suscribir(
      filtroDe(pestana),
      (evento) => setEventos((previos) => (previos.has(evento.id) ? previos : new Map(previos).set(evento.id, evento))),
      { alFinDeHistoria: () => setCargando(false) },
    );
    const tope = setTimeout(() => setCargando(false), 4000);
    return () => {
      suscripcion.cerrar();
      clearTimeout(tope);
    };
  }, [pestana]);

  useEffect(() => {
    const ids = cargarMisPreguntas();
    if (ids.length === 0) return;
    let vigente = true;
    obtenerRed()
      .consultar({ ids })
      .then((encontradas) => {
        if (vigente) setMisPreguntas(encontradas.sort((a, b) => b.created_at - a.created_at));
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const temaNormalizado = normalizarTema(tema);
  const lista = ordenar(eventos).filter((evento) => temaNormalizado.length === 0 || temasDe(evento).includes(temaNormalizado));

  return (
    <section className="contenedor">
      <h1>Explorar</h1>
      <div className="pestanas">
        {PESTANAS.map((opcion) => (
          <button key={opcion.valor} type="button" className={pestana === opcion.valor ? "activa" : ""} onClick={() => setPestana(opcion.valor)}>
            {opcion.etiqueta}
          </button>
        ))}
        <input className="filtro" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Filtrar por tema" />
      </div>
      {cargando && lista.length === 0 ? <p className="ayuda">Buscando en tus relays…</p> : null}
      {!cargando && lista.length === 0 ? <p className="ayuda">Nada por acá todavía. Podés ser quien empiece.</p> : null}
      <ul className="lista">
        {lista.map((evento) => (
          <li key={evento.id} className="tarjeta">
            <div className="encabezado">
              <Autor pubkey={evento.pubkey} />
              <time>{fechaCorta(evento.created_at)}</time>
            </div>
            <a className="cuerpo" href={evento.kind === KIND_TAREA ? `#/tarea/${evento.id}` : `#/hilo/${evento.id}`}>
              {evento.kind === KIND_PUBLICACION ? (
                <span className="publicacion">
                  {imetaDe(evento) ? <img className="miniatura" src={imetaDe(evento)?.url} alt={imetaDe(evento)?.alt ?? ""} loading="lazy" /> : null}
                  <span>
                    <strong>{valorDeTag(evento, "title")}</strong>
                    <br />
                    {resumen(evento.content, 160)}
                  </span>
                </span>
              ) : (
                resumen(textoDe(evento) ?? "")
              )}
            </a>
            <div className="pie">
              {temasDe(evento).map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
              {evento.kind === KIND_TAREA ? <span className="chip presupuesto">{Math.round(Number(valorDeTag(evento, "bid") ?? 0) / 1000)} sats</span> : null}
            </div>
          </li>
        ))}
      </ul>
      {misPreguntas.length > 0 ? (
        <>
          <h2>Tus preguntas</h2>
          <ul className="lista">
            {misPreguntas.map((evento) => (
              <li key={evento.id} className="tarjeta">
                <a className="cuerpo" href={`#/hilo/${evento.id}`}>
                  {resumen(evento.content)}
                </a>
                <div className="pie">
                  <time>{fechaCorta(evento.created_at)}</time>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
