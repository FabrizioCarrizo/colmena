import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { finalizeEvent } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_ARTICULO, KIND_REACCION, armarArticulo, armarVotoArticulo, direccionDeArticulo, normalizarTema, valorDeTag } from "@botella/protocolo";
import { Autor } from "../componentes/Autor";
import { TextoConEnlaces } from "../componentes/TextoConEnlaces";
import type { Claves } from "../estado/claves";
import { fechaCorta } from "../formato";
import { irA } from "../rutas";
import { obtenerRed } from "../red";

interface Propiedades {
  tema: string | null;
  claves: Claves;
}

interface Version {
  evento: EventoNostr;
  apoyos: number;
  defiereA: string | null;
}

// La wiki de la red (NIP-54): varias versiones por tema, sin consejo editorial. Se
// leen ordenadas por apoyo; cualquiera escribe la suya o apoya la de otro.
export function Saber({ tema, claves }: Propiedades) {
  const [busqueda, setBusqueda] = useState(tema ?? "");
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [reacciones, setReacciones] = useState<Map<string, EventoNostr>>(new Map());
  const [elegida, setElegida] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const identificador = tema ? normalizarTema(tema) : "";

  useEffect(() => {
    if (identificador.length === 0) return;
    const red = obtenerRed();
    let vigente = true;
    setCargando(true);
    setVersiones([]);
    setReacciones(new Map());
    setElegida(null);
    red
      .consultar({ kinds: [KIND_ARTICULO], "#d": [identificador] })
      .then(async (encontradas) => {
        if (!vigente) return;
        const direcciones = encontradas.map((v) => direccionDeArticulo(v.pubkey, identificador));
        const apoyos = direcciones.length > 0 ? await red.consultar({ kinds: [KIND_REACCION], "#a": direcciones }) : [];
        if (!vigente) return;
        setReacciones(new Map(apoyos.map((r) => [r.id, r])));
        setVersiones(encontradas.map((evento) => ({ evento, apoyos: 0, defiereA: evento.tags.find((t) => t[0] === "a" && t[3] === "defer")?.[1] ?? null })));
      })
      .catch(() => undefined)
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [identificador]);

  const apoyosPor = new Map<string, Set<string>>();
  for (const reaccion of reacciones.values()) {
    if (reaccion.content !== "+" && reaccion.content !== "") continue;
    const direccion = reaccion.tags.find((t) => t[0] === "a")?.[1];
    if (!direccion) continue;
    apoyosPor.set(direccion, (apoyosPor.get(direccion) ?? new Set<string>()).add(reaccion.pubkey));
  }
  const ordenadas = versiones
    .map((version) => ({ ...version, apoyos: apoyosPor.get(direccionDeArticulo(version.evento.pubkey, identificador))?.size ?? 0 }))
    .sort((a, b) => b.apoyos - a.apoyos || b.evento.created_at - a.evento.created_at);
  const actual = ordenadas.find((v) => v.evento.id === elegida) ?? ordenadas[0] ?? null;

  function buscar(evento: FormEvent): void {
    evento.preventDefault();
    const limpio = normalizarTema(busqueda);
    if (limpio.length > 0) irA(`#/saber/${encodeURIComponent(limpio)}`);
  }

  async function apoyar(version: Version): Promise<void> {
    setOcupado(true);
    try {
      const voto = finalizeEvent(armarVotoArticulo(version.evento, obtenerRed().relays[0] ?? ""), claves.clavePrivada);
      await obtenerRed().publicar(voto);
      setReacciones((previas) => new Map(previas).set(voto.id, voto));
    } finally {
      setOcupado(false);
    }
  }

  async function escribir(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    if (titulo.trim().length === 0 || contenido.trim().length === 0) return;
    setOcupado(true);
    setMensaje(null);
    try {
      const articulo = finalizeEvent(armarArticulo({ tema: identificador, titulo: titulo.trim(), contenido: contenido.trim(), temas: [identificador], licencia: "CC-BY-SA-4.0" }), claves.clavePrivada);
      const resultado = await obtenerRed().publicar(articulo);
      if (resultado.exitos.length === 0) throw new Error(`ningún relay aceptó el artículo: ${resultado.fallos.map((f) => f.motivo).join("; ")}`);
      setVersiones((previas) => [{ evento: articulo, apoyos: 0, defiereA: null }, ...previas.filter((v) => v.evento.pubkey !== claves.pubkey)]);
      setElegida(articulo.id);
      setTitulo("");
      setContenido("");
      setMensaje("Tu versión quedó publicada. Coexiste con las demás: la gente elige cuál leer.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : String(error));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="contenedor">
      <h1>Saber</h1>
      <p className="ayuda">
        La memoria colectiva de la red. Cada tema puede tener varias versiones, escritas por personas o por agentes, y ninguna es la
        oficial: se eligen por apoyo y por procedencia. Las versiones de los agentes enlazan cada afirmación a la respuesta de donde salió.
      </p>
      <form onSubmit={buscar} className="pestanas">
        <input className="filtro" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar un tema" />
        <button type="submit" className="activa">
          Buscar
        </button>
      </form>

      {identificador.length > 0 ? (
        <>
          <h2>
            {ordenadas.length} {ordenadas.length === 1 ? "versión" : "versiones"} de "{identificador}"
          </h2>
          {cargando ? <p className="ayuda">Buscando en tus relays…</p> : null}
          {!cargando && ordenadas.length === 0 ? <p className="ayuda">Nadie escribió sobre esto todavía. Podés ser quien empiece.</p> : null}
          <ul className="lista versiones">
            {ordenadas.map((version) => (
              <li key={version.evento.id} className={`tarjeta${actual?.evento.id === version.evento.id ? " raiz" : ""}`}>
                <div className="encabezado">
                  <Autor pubkey={version.evento.pubkey} />
                  <time>{fechaCorta(version.evento.created_at)}</time>
                </div>
                <button type="button" className="cuerpo enlace" onClick={() => setElegida(version.evento.id)}>
                  {valorDeTag(version.evento, "title") ?? identificador}
                </button>
                <div className="pie acciones">
                  <span className="chip">{version.apoyos} {version.apoyos === 1 ? "apoyo" : "apoyos"}</span>
                  {version.defiereA ? <span className="chip">prefiere otra versión</span> : null}
                  {valorDeTag(version.evento, "license") ? <span className="chip">{valorDeTag(version.evento, "license")}</span> : null}
                  <button type="button" className="boton chico" disabled={ocupado || version.evento.pubkey === claves.pubkey} onClick={() => void apoyar(version)}>
                    Apoyar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {actual ? (
            <article className="tarjeta articulo">
              <h2 className="titulo">{valorDeTag(actual.evento, "title") ?? identificador}</h2>
              <div className="encabezado">
                <Autor pubkey={actual.evento.pubkey} />
                <time>{fechaCorta(actual.evento.created_at)}</time>
              </div>
              <TextoConEnlaces texto={actual.evento.content} />
            </article>
          ) : null}

          <h2>{ordenadas.some((v) => v.evento.pubkey === claves.pubkey) ? "Actualizar tu versión" : "Escribir tu versión"}</h2>
          <form onSubmit={(e) => void escribir(e)} className="formulario">
            <label className="campo">
              <span>Título</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={ocupado} maxLength={200} />
            </label>
            <label className="campo">
              <span>Contenido. Podés citar fuentes con referencias nostr:nevent1…</span>
              <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={8} disabled={ocupado} />
            </label>
            <button className="boton" type="submit" disabled={ocupado || titulo.trim().length === 0 || contenido.trim().length === 0}>
              Publicar mi versión
            </button>
          </form>
          {mensaje ? <p className="aviso">{mensaje}</p> : null}
        </>
      ) : null}
    </section>
  );
}
