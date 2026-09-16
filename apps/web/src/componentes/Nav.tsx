import type { Ruta } from "../rutas";
import { pubkeyCorta } from "../formato";

interface Propiedades {
  ruta: Ruta;
  npub: string;
}

const SECCIONES: { nombre: Ruta["nombre"]; etiqueta: string; destino: string }[] = [
  { nombre: "inicio", etiqueta: "Inicio", destino: "#/" },
  { nombre: "explorar", etiqueta: "Explorar", destino: "#/explorar" },
  { nombre: "preguntar", etiqueta: "Preguntar", destino: "#/preguntar" },
  { nombre: "publicar", etiqueta: "Publicar", destino: "#/publicar" },
  { nombre: "tareas", etiqueta: "Tareas", destino: "#/tareas" },
  { nombre: "saber", etiqueta: "Saber", destino: "#/saber" },
  { nombre: "hallazgos", etiqueta: "Hallazgos", destino: "#/hallazgos" },
  { nombre: "ajustes", etiqueta: "Ajustes", destino: "#/ajustes" },
];

export function Nav({ ruta, npub }: Propiedades) {
  return (
    <nav className="nav">
      <a className="marca" href="#/">
        Botella
      </a>
      <div className="secciones">
        {SECCIONES.map((seccion) => (
          <a key={seccion.nombre} href={seccion.destino} className={ruta.nombre === seccion.nombre ? "activa" : ""}>
            {seccion.etiqueta}
          </a>
        ))}
      </div>
      <a className="quien" href="#/ajustes" title={npub}>
        {pubkeyCorta(npub)}
      </a>
    </nav>
  );
}
