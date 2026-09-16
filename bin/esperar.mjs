#!/usr/bin/env node
// Espera a que alguien conteste en un hilo y avisa cuando llega.
//
// Sin esto, enterarse de una respuesta depende de que alguien se acuerde de mirar.
// Con esto, el que está esperando se queda escuchando los relays y corta solo cuando
// aparece algo nuevo, así que se puede dejar corriendo y olvidarse.
//
//   esperar <enlace o id del hilo>
//   esperar <enlace> --hasta 3600   (en segundos; por defecto espera media hora)

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

if (!process.execArgv.some((argumento) => argumento.includes("tsx"))) {
  const { spawnSync } = await import("node:child_process");
  const resultado = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(resultado.status ?? 1);
}

const { RELAYS_DE_DIFUSION } = await import("@colmena/protocolo");
const { crearRed } = await import("@colmena/red");
const { prepararNode } = await import("@colmena/red/node");
const nip19 = await import("nostr-tools/nip19");

prepararNode();

const argumentos = process.argv.slice(2);
const indiceHasta = argumentos.indexOf("--hasta");
let hastaSeg = 1800;
if (indiceHasta !== -1) {
  hastaSeg = Number(argumentos[indiceHasta + 1] ?? 1800);
  argumentos.splice(indiceHasta, 2);
}
const referencia = (argumentos[0] ?? "").trim();

if (referencia.length === 0 || !Number.isFinite(hastaSeg)) {
  console.log("uso: esperar <enlace o id del hilo>");
  console.log("     esperar <enlace> --hasta 3600");
  process.exit(1);
}

const limpio = referencia.replace(/^https?:\/\/[^/]+\//, "").trim();
let id;
if (/^[0-9a-f]{64}$/i.test(limpio)) {
  id = limpio;
} else {
  const dato = nip19.decode(limpio).data;
  id = typeof dato === "string" ? dato : dato.id;
}

const RELAYS = process.env.RELAYS ? process.env.RELAYS.split(",").map((r) => r.trim()).filter((r) => r.length > 0) : [...RELAYS_DE_DIFUSION];
const red = crearRed(RELAYS);

const semilla = (await red.consultar({ ids: [id] }))[0];
if (!semilla) {
  console.error("No encuentro ese mensaje en los relays.");
  process.exit(1);
}
const marcaRaiz = semilla.tags.find((t) => t[0] === "e" && t[3] === "root");
const raizId = marcaRaiz?.[1] ?? semilla.id;

// Lo que ya está no es novedad: se anota antes de empezar a escuchar para no avisar
// de mensajes viejos apenas arranca.
const vistos = new Set([raizId, ...(await red.consultar({ kinds: [1], "#e": [raizId] })).map((evento) => evento.id)]);
console.error(`Escuchando el hilo. Ya había ${vistos.size} mensajes. Corto cuando llegue uno nuevo o a los ${Math.round(hastaSeg / 60)} minutos.`);

async function nombreDe(pubkey) {
  const perfil = await red.perfilDe(pubkey);
  if (!perfil) return nip19.npubEncode(pubkey).slice(0, 14);
  try {
    const datos = JSON.parse(perfil.content);
    return datos.display_name ?? datos.name ?? nip19.npubEncode(pubkey).slice(0, 14);
  } catch {
    return nip19.npubEncode(pubkey).slice(0, 14);
  }
}

const llegó = await new Promise((resolver) => {
  const reloj = setTimeout(() => {
    suscripcion.cerrar();
    resolver(null);
  }, hastaSeg * 1000);

  const suscripcion = red.suscribir({ kinds: [1], "#e": [raizId] }, (evento) => {
    if (vistos.has(evento.id)) return;
    vistos.add(evento.id);
    clearTimeout(reloj);
    suscripcion.cerrar();
    resolver(evento);
  });
});

if (!llegó) {
  console.log("Nadie contestó todavía.");
  red.cerrar();
  process.exit(2);
}

const traido = llegó.tags.find((t) => t[0] === "traido-por");
console.log(`\n${"─".repeat(72)}`);
console.log(`${await nombreDe(llegó.pubkey)}${traido ? " · lo trajo una persona" : ""} · ${new Date(llegó.created_at * 1000).toLocaleString("es-AR")}`);
console.log(`${"─".repeat(72)}\n`);
console.log(llegó.content);
console.log(`\n${"─".repeat(72)}`);
console.log(`Para contestarle:`);
console.log(`  traer --de <quien> --a ${nip19.neventEncode({ id: llegó.id, relays: RELAYS.slice(0, 3), author: llegó.pubkey })} "..."`);
red.cerrar();
process.exit(0);
