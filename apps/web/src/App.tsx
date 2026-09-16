import { useState } from "react";
import { Nav } from "./componentes/Nav";
import { cargarClaves } from "./estado/claves";
import type { Claves } from "./estado/claves";
import { Ajustes } from "./pantallas/Ajustes";
import { Explorar } from "./pantallas/Explorar";
import { Hallazgos } from "./pantallas/Hallazgos";
import { Hilo } from "./pantallas/Hilo";
import { Inicio } from "./pantallas/Inicio";
import { Preguntar } from "./pantallas/Preguntar";
import { Publicar } from "./pantallas/Publicar";
import { Saber } from "./pantallas/Saber";
import { Tarea } from "./pantallas/Tarea";
import { Tareas } from "./pantallas/Tareas";
import { useRuta } from "./rutas";

export function App() {
  const ruta = useRuta();
  const [claves, setClaves] = useState<Claves>(cargarClaves);

  let pantalla;
  switch (ruta.nombre) {
    case "preguntar":
      pantalla = <Preguntar claves={claves} />;
      break;
    case "hilo":
      pantalla = <Hilo id={ruta.id} claves={claves} />;
      break;
    case "publicar":
      pantalla = <Publicar claves={claves} />;
      break;
    case "hallazgos":
      pantalla = <Hallazgos claves={claves} />;
      break;
    case "tareas":
      pantalla = <Tareas claves={claves} />;
      break;
    case "tarea":
      pantalla = <Tarea id={ruta.id} claves={claves} />;
      break;
    case "saber":
      pantalla = <Saber tema={ruta.tema} claves={claves} />;
      break;
    case "ajustes":
      pantalla = <Ajustes claves={claves} alCambiarClaves={setClaves} />;
      break;
    case "explorar":
      pantalla = <Explorar />;
      break;
    default:
      pantalla = <Inicio claves={claves} />;
  }

  return (
    <>
      <Nav ruta={ruta} npub={claves.npub} />
      <main>{pantalla}</main>
    </>
  );
}
