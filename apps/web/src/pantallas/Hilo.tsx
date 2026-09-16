import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Event as EventoNostr } from "nostr-tools/pure";
import {
  CONTENIDO_ACEPTACION,
  KIND_NOTA,
  KIND_PUBLICACION,
  KIND_REACCION,
  LARGO_MAX_RESPUESTA,
  POW_RESPUESTA,
  armarAceptacion,
  armarRespuesta,
  armarVoto,
  hiloDe,
  imetaDe,
  powDe,
  temasDe,
  textoDe,
  valorDeTag,
} from "@botella/protocolo";
import { Autor } from "../componentes/Autor";
import type { Claves } from "../estado/claves";
import { fechaCorta } from "../formato";
import { minarYFirmarEnWorker } from "../minado";
import { obtenerRed } from "../red";

interface Propiedades {
  id: string;
  claves: Claves;
}

interface RespuestaEvaluada {
  evento: EventoNostr;
  votos: number;
  aceptada: boolean;
  pow: number;
}

function referenciaDe(reaccion: EventoNostr): string | null {
  const tagsE = reaccion.tags.filter((t) => t[0] === "e");
  const ultimo = tagsE[tagsE.length - 1];
  return ultimo?.[1] ?? null;
}

export function Hilo({ id, claves }: Propiedades) {
  const [raiz, setRaiz] = useState<EventoNostr | null | undefined>(undefined);
  const [respuestas, setRespuestas] = useState<Map<string, EventoNostr>>(new Map());
  const [reacciones, setReacciones] = useState<Map<string, EventoNostr>>(new Map());
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const red = obtenerRed();
    let vigente = true;
    setRaiz(undefined);
    setRespuestas(new Map());
    setReacciones(new Map());
    red
      .consultar({ ids: [id] })
      .then((encontrados) => {
        if (vigente) setRaiz(encontrados[0] ?? null);
      })
      .catch(() => {
        if (vigente) setRaiz(null);
      });
    const suscripcion = red.suscribir({ kinds: [KIND_NOTA], "#e": [id] }, (evento) => {
      if (hiloDe(evento).raiz?.id !== id) return;
      setRespuestas((previas) => (previas.has(evento.id) ? previas : new Map(previas).set(evento.id, evento)));
    });
    return () => {
      vigente = false;
      suscripcion.cerrar();
    };
  }, [id]);

  const idsRespuestas = useMemo(() => [...respuestas.keys()].sort().join(","), [respuestas]);

  // Las reacciones apuntan a cada respuesta, así que la suscripción se rehace cuando
  // aparecen respuestas nuevas.
  useEffect(() => {
    if (idsRespuestas.length === 0) return;
    const suscripcion = obtenerRed().suscribir({ kinds: [KIND_REACCION], "#e": idsRespuestas.split(",") }, (evento) => {
      setReacciones((previas) => (previas.has(evento.id) ? previas : new Map(previas).set(evento.id, evento)));
    });
    return () => suscripcion.cerrar();
  }, [idsRespuestas]);

  const evaluadas = useMemo<RespuestaEvaluada[]>(() => {
    const porRespuesta = new Map<string, Map<string, string>>();
    for (const reaccion of reacciones.values()) {
      const objetivo = referenciaDe(reaccion);
      if (!objetivo) continue;
      const porAutor = porRespuesta.get(objetivo) ?? new Map<string, string>();
      // Una reacción por autor y respuesta: la última publicada manda.
      const previa = porAutor.get(reaccion.pubkey);
      if (previa === undefined || reaccion.created_at >= Number(previa.split(":")[0])) {
        porAutor.set(reaccion.pubkey, `${reaccion.created_at}:${reaccion.content}`);
      }
      porRespuesta.set(objetivo, porAutor);
    }
    return [...respuestas.values()]
      .map((evento) => {
        const porAutor = porRespuesta.get(evento.id) ?? new Map<string, string>();
        let votos = 0;
        let aceptada = false;
        for (const [autor, valor] of porAutor) {
          const contenido = valor.slice(valor.indexOf(":") + 1);
          if (contenido === "+" || contenido === "") votos += 1;
          else if (contenido === "-") votos -= 1;
          else if (contenido === CONTENIDO_ACEPTACION && raiz && autor === raiz.pubkey) aceptada = true;
        }
        return { evento, votos, aceptada, pow: powDe(evento) };
      })
      .sort((a, b) => Number(b.aceptada) - Number(a.aceptada) || b.votos - a.votos || b.pow - a.pow || a.evento.created_at - b.evento.created_at);
  }, [respuestas, reacciones, raiz]);

  async function publicar(clave: string, accion: () => Promise<void>): Promise<void> {
    setOcupado(clave);
    setError(null);
    try {
      await accion();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setOcupado(null);
    }
  }

  const relayPista = obtenerRed().relays[0] ?? "";

  function votar(respuesta: EventoNostr, positivo: boolean): void {
    void publicar(`voto:${respuesta.id}`, async () => {
      const voto = await minarYFirmarEnWorker(armarVoto(respuesta, positivo, relayPista), claves, 0);
      await obtenerRed().publicar(voto);
      setReacciones((previas) => new Map(previas).set(voto.id, voto));
    });
  }

  function aceptar(respuesta: EventoNostr): void {
    void publicar(`aceptar:${respuesta.id}`, async () => {
      const aceptacion = await minarYFirmarEnWorker(armarAceptacion(respuesta, relayPista), claves, 0);
      await obtenerRed().publicar(aceptacion);
      setReacciones((previas) => new Map(previas).set(aceptacion.id, aceptacion));
    });
  }

  function responder(evento: FormEvent): void {
    evento.preventDefault();
    if (!raiz || texto.trim().length === 0) return;
    void publicar("responder", async () => {
      const respuesta = await minarYFirmarEnWorker(armarRespuesta(raiz, texto.trim(), relayPista), claves, POW_RESPUESTA);
      const resultado = await obtenerRed().publicar(respuesta);
      if (resultado.exitos.length === 0) throw new Error(`ningún relay aceptó la respuesta: ${resultado.fallos.map((f) => f.motivo).join("; ")}`);
      setRespuestas((previas) => new Map(previas).set(respuesta.id, respuesta));
      setTexto("");
    });
  }

  if (raiz === undefined) return <section className="contenedor">Buscando el hilo en tus relays…</section>;
  if (raiz === null) return <section className="contenedor">No encontré este evento en tus relays. Probá agregando el relay donde se publicó.</section>;

  const soyElAutor = raiz.pubkey === claves.pubkey;

  return (
    <section className="contenedor">
      <article className="tarjeta raiz">
        <div className="encabezado">
          <Autor pubkey={raiz.pubkey} />
          <time>{fechaCorta(raiz.created_at)}</time>
        </div>
        {raiz.kind === KIND_PUBLICACION ? (
          <>
            <h2 className="titulo">{valorDeTag(raiz, "title")}</h2>
            {imetaDe(raiz) ? <img className="imagen" src={imetaDe(raiz)?.url} alt={imetaDe(raiz)?.alt ?? ""} /> : null}
            {valorDeTag(raiz, "location") ? <p className="ayuda">{valorDeTag(raiz, "location")}</p> : null}
          </>
        ) : null}
        <p className="texto">{textoDe(raiz)}</p>
        <div className="pie">
          {temasDe(raiz).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </article>

      <h2>
        {evaluadas.length} {evaluadas.length === 1 ? "respuesta" : "respuestas"}
      </h2>
      {evaluadas.length === 0 ? <p className="ayuda">Todavía nadie respondió. Las respuestas llegan cuando llegan: la red no apura a nadie.</p> : null}
      <ul className="lista">
        {evaluadas.map(({ evento, votos, aceptada, pow }) => (
          <li key={evento.id} className={`tarjeta respuesta${aceptada ? " aceptada" : ""}`}>
            <div className="encabezado">
              <Autor pubkey={evento.pubkey} />
              <time>{fechaCorta(evento.created_at)}</time>
            </div>
            <p className="texto">{evento.content}</p>
            <div className="pie acciones">
              <button type="button" className="boton chico" disabled={ocupado !== null} onClick={() => votar(evento, true)} title="Votar a favor">
                ▲
              </button>
              <span className="votos" title={`${pow} bits de prueba de trabajo`}>
                {votos}
              </span>
              <button type="button" className="boton chico" disabled={ocupado !== null} onClick={() => votar(evento, false)} title="Votar en contra">
                ▼
              </button>
              {aceptada ? <span className="chip aceptada">respuesta aceptada</span> : null}
              {soyElAutor && !aceptada ? (
                <button type="button" className="boton chico" disabled={ocupado !== null} onClick={() => aceptar(evento)}>
                  Aceptar respuesta
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={responder} className="formulario">
        <label className="campo">
          <span>Responder</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={LARGO_MAX_RESPUESTA} disabled={ocupado !== null} placeholder="Tu respuesta queda firmada con tu clave, para siempre." />
        </label>
        <button className="boton" type="submit" disabled={ocupado !== null || texto.trim().length === 0}>
          {ocupado === "responder" ? "Minando y publicando…" : "Publicar respuesta"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
