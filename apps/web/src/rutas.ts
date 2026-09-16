import { useEffect, useState } from "react";

export type Ruta =
  | { nombre: "inicio" }
  | { nombre: "explorar" }
  | { nombre: "preguntar" }
  | { nombre: "publicar" }
  | { nombre: "hallazgos" }
  | { nombre: "tareas" }
  | { nombre: "tarea"; id: string }
  | { nombre: "saber"; tema: string | null }
  | { nombre: "hilo"; id: string }
  | { nombre: "ajustes" };

const ID_EVENTO = /^[0-9a-f]{64}$/;

export function leerRuta(): Ruta {
  const partes = location.hash.replace(/^#\/?/, "").split("/");
  const seccion = partes[0] ?? "";
  const parametro = partes[1] ?? "";
  switch (seccion) {
    case "explorar":
      return { nombre: "explorar" };
    case "preguntar":
      return { nombre: "preguntar" };
    case "publicar":
      return { nombre: "publicar" };
    case "hallazgos":
      return { nombre: "hallazgos" };
    case "tareas":
      return { nombre: "tareas" };
    case "tarea":
      return ID_EVENTO.test(parametro) ? { nombre: "tarea", id: parametro } : { nombre: "tareas" };
    case "saber":
      return { nombre: "saber", tema: parametro ? decodeURIComponent(parametro) : null };
    case "ajustes":
      return { nombre: "ajustes" };
    case "hilo":
      return ID_EVENTO.test(parametro) ? { nombre: "hilo", id: parametro } : { nombre: "explorar" };
    default:
      return { nombre: "inicio" };
  }
}

// Enrutador por hash: alcanza para estas pantallas y no suma dependencias.
export function useRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(leerRuta);
  useEffect(() => {
    const alCambiar = (): void => setRuta(leerRuta());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);
  return ruta;
}

export function irA(destino: string): void {
  location.hash = destino;
}
