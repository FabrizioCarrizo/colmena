import { useState } from "react";
import type { FormEvent } from "react";
import { createUploadAuth } from "blossom-client-sdk";
import type { Signer } from "blossom-client-sdk";
import { uploadBlob } from "blossom-client-sdk/actions/upload";
import { finalizeEvent } from "nostr-tools/pure";
import { armarPublicacion } from "@botella/protocolo";
import { cargarBlossom } from "../estado/ajustes";
import type { Claves } from "../estado/claves";
import { obtenerRed } from "../red";

interface Propiedades {
  claves: Claves;
}

type Fase = { nombre: "editando" } | { nombre: "subiendo" } | { nombre: "publicando" } | { nombre: "listo"; id: string } | { nombre: "error"; mensaje: string };

// NIP-68 solo admite estos formatos en eventos de imagen.
const FORMATOS = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/apng"]);

function separarTemas(texto: string): string[] {
  return texto
    .split(",")
    .map((tema) => tema.trim())
    .filter((tema) => tema.length > 0);
}

function dimensionesDe(archivo: File): Promise<string | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolver(`${imagen.naturalWidth}x${imagen.naturalHeight}`);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      resolver(null);
    };
    imagen.src = url;
  });
}

export function Publicar({ claves }: Propiedades) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [alt, setAlt] = useState("");
  const [temas, setTemas] = useState("");
  const [lugar, setLugar] = useState("");
  const [fase, setFase] = useState<Fase>({ nombre: "editando" });

  // El archivo sube a un servidor Blossom firmando la autorización con la clave
  // del usuario; después se anuncia en Nostr con un evento de imagen que apunta
  // al blob por su hash. Nostr no guarda archivos; Blossom sí.
  async function publicar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    if (!archivo || titulo.trim().length === 0) return;
    if (!FORMATOS.has(archivo.type)) {
      setFase({ nombre: "error", mensaje: "Formato no admitido. Valen JPEG, PNG, GIF, WebP, AVIF y APNG." });
      return;
    }
    const firmante: Signer = async (borrador) => finalizeEvent(borrador, claves.clavePrivada);
    try {
      setFase({ nombre: "subiendo" });
      const servidor = cargarBlossom();
      const [descriptor, dimensiones] = await Promise.all([
        uploadBlob(servidor, archivo, { onAuth: (_servidor, sha256, tipo) => createUploadAuth(firmante, sha256, { type: tipo }) }),
        dimensionesDe(archivo),
      ]);
      setFase({ nombre: "publicando" });
      const plantilla = armarPublicacion({
        url: descriptor.url,
        mime: descriptor.type ?? archivo.type,
        sha256: descriptor.sha256,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        ...(dimensiones ? { dimensiones } : {}),
        ...(alt.trim() ? { alt: alt.trim() } : {}),
        temas: separarTemas(temas),
        ...(lugar.trim() ? { lugar: lugar.trim() } : {}),
      });
      const publicacion = finalizeEvent(plantilla, claves.clavePrivada);
      const resultado = await obtenerRed().publicar(publicacion);
      if (resultado.exitos.length === 0) {
        setFase({ nombre: "error", mensaje: `Subió el archivo pero ningún relay aceptó la publicación: ${resultado.fallos.map((f) => f.motivo).join("; ")}` });
        return;
      }
      setFase({ nombre: "listo", id: publicacion.id });
    } catch (error) {
      setFase({ nombre: "error", mensaje: error instanceof Error ? error.message : String(error) });
    }
  }

  const ocupado = fase.nombre === "subiendo" || fase.nombre === "publicando";

  return (
    <section className="contenedor">
      <h1>Publicá</h1>
      <p className="ayuda">
        Una imagen, un título y lo que quieras contar. Se sube a tu servidor Blossom y se anuncia en la red como un evento de imagen: la
        van a ver personas, y agentes que curan para sus dueños la van a encontrar aunque nadie te siga.
      </p>
      <form onSubmit={(e) => void publicar(e)} className="formulario">
        <label className="campo">
          <span>Imagen</span>
          <input type="file" accept="image/*" disabled={ocupado} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
        <label className="campo">
          <span>Título</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={ocupado} maxLength={200} />
        </label>
        <label className="campo">
          <span>Descripción</span>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} disabled={ocupado} maxLength={4000} />
        </label>
        <label className="campo">
          <span>Texto alternativo, para quien no ve la imagen y para los agentes</span>
          <input value={alt} onChange={(e) => setAlt(e.target.value)} disabled={ocupado} maxLength={500} />
        </label>
        <label className="campo">
          <span>Temas, separados por coma</span>
          <input value={temas} onChange={(e) => setTemas(e.target.value)} disabled={ocupado} placeholder="arte, pintura, caribe" />
        </label>
        <label className="campo">
          <span>Lugar</span>
          <input value={lugar} onChange={(e) => setLugar(e.target.value)} disabled={ocupado} placeholder="Arima, Trinidad y Tobago" />
        </label>
        <button className="boton" type="submit" disabled={ocupado || !archivo || titulo.trim().length === 0}>
          {fase.nombre === "subiendo" ? "Subiendo la imagen…" : fase.nombre === "publicando" ? "Publicando…" : "Publicar"}
        </button>
      </form>
      {fase.nombre === "listo" ? (
        <p className="aviso">
          Publicada. <a href={`#/hilo/${fase.id}`}>Verla</a>.
        </p>
      ) : null}
      {fase.nombre === "error" ? <p className="error">{fase.mensaje}</p> : null}
    </section>
  );
}
