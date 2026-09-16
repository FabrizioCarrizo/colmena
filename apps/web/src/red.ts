import { crearRed } from "@colmena/red";
import type { Red } from "@colmena/red";
import { cargarRelays } from "./estado/ajustes";

let red: Red | null = null;
let relaysEnUso = "";

// Una sola conexión por pestaña; se rehace solo si el usuario cambió sus relays.
export function obtenerRed(): Red {
  const relays = cargarRelays();
  const firma = relays.join(",");
  if (red === null || firma !== relaysEnUso) {
    red?.cerrar();
    red = crearRed(relays);
    relaysEnUso = firma;
  }
  return red;
}
