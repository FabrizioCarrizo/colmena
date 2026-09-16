import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LARGO_MAX_PEDIDO, POW_PEDIDO, armarPregunta } from "@colmena/protocolo";
import { recordarPregunta } from "../estado/ajustes";
import type { Claves } from "../estado/claves";
import { minarYFirmarEnWorker } from "../minado";
import { obtenerRed } from "../red";

interface Propiedades {
  claves: Claves;
}

type Fase = { nombre: "editando" } | { nombre: "minando"; desde: number } | { nombre: "publicando" } | { nombre: "listo"; id: string } | { nombre: "error"; mensaje: string };

function separarTemas(texto: string): string[] {
  return texto
    .split(",")
    .map((tema) => tema.trim())
    .filter((tema) => tema.length > 0);
}

export function Preguntar({ claves }: Propiedades) {
  const [texto, setTexto] = useState("");
  const [temas, setTemas] = useState("");
  const [fase, setFase] = useState<Fase>({ nombre: "editando" });
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (fase.nombre !== "minando") return;
    const desde = fase.desde;
    const intervalo = setInterval(() => setSegundos(Math.round((Date.now() - desde) / 1000)), 500);
    return () => clearInterval(intervalo);
  }, [fase]);

  async function lanzar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    const limpio = texto.trim();
    if (limpio.length === 0) return;
    try {
      setFase({ nombre: "minando", desde: Date.now() });
      const pregunta = await minarYFirmarEnWorker(armarPregunta(limpio, { temas: separarTemas(temas) }), claves, POW_PEDIDO);
      setFase({ nombre: "publicando" });
      const resultado = await obtenerRed().publicar(pregunta);
      if (resultado.exitos.length === 0) {
        setFase({ nombre: "error", mensaje: `Ningún relay la aceptó: ${resultado.fallos.map((f) => f.motivo).join("; ")}` });
        return;
      }
      recordarPregunta(pregunta.id);
      setFase({ nombre: "listo", id: pregunta.id });
      setTexto("");
      setTemas("");
    } catch (error) {
      setFase({ nombre: "error", mensaje: error instanceof Error ? error.message : String(error) });
    }
  }

  const ocupado = fase.nombre === "minando" || fase.nombre === "publicando";

  return (
    <section className="contenedor">
      <h1>Preguntá</h1>
      <p className="ayuda">
        Tu pregunta se publica como una nota común de Nostr, firmada con tu clave, con prueba de trabajo para que responder cueste
        inferencia solo a quien quiera. La pueden contestar humanos y agentes de cualquier parte.
      </p>
      <form onSubmit={(e) => void lanzar(e)} className="formulario">
        <label className="campo">
          <span>Pregunta</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} maxLength={LARGO_MAX_PEDIDO} disabled={ocupado} placeholder="¿Qué querés saber?" />
          <small>
            {texto.length} / {LARGO_MAX_PEDIDO}
          </small>
        </label>
        <label className="campo">
          <span>Temas, separados por coma</span>
          <input value={temas} onChange={(e) => setTemas(e.target.value)} disabled={ocupado} placeholder="nostr, arte, física" />
        </label>
        <button className="boton" type="submit" disabled={ocupado || texto.trim().length === 0}>
          {fase.nombre === "minando" ? `Minando prueba de trabajo (${POW_PEDIDO} bits)… ${segundos}s` : fase.nombre === "publicando" ? "Publicando…" : "Lanzar"}
        </button>
      </form>
      {fase.nombre === "listo" ? (
        <p className="aviso">
          Publicada. <a href={`#/hilo/${fase.id}`}>Ver el hilo</a> para seguir las respuestas.
        </p>
      ) : null}
      {fase.nombre === "error" ? <p className="error">{fase.mensaje}</p> : null}
    </section>
  );
}
