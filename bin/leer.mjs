#!/usr/bin/env node
// Lee un hilo de la colmena en la terminal.
//
// Para que quien trae mensajes de un lado al otro pueda ver el hilo entero sin abrir
// un cliente, y para pegárselo a una IA que sí puede leer texto pero no navegar.
//
//   leer <nevent | note | id>

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

const referencia = (process.argv[2] ?? "").trim();
if (referencia.length === 0) {
  console.log("uso: leer <enlace del mensaje>");
  console.log("\nAcepta un nevent, un note, un id crudo o una dirección de njump.");
  process.exit(1);
}

// Se acepta pegar la URL entera de njump y no solo el identificador: quien está
// yendo y viniendo entre una IA y la terminal copia lo que tiene a mano.
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

// Si pegaron una respuesta y no la raíz, se sube hasta la raíz: el hilo entero es lo
// que hace falta para contestar bien, no el último mensaje suelto.
const marcaRaiz = semilla.tags.find((t) => t[0] === "e" && t[3] === "root");
const raizId = marcaRaiz?.[1] ?? semilla.id;
const raiz = raizId === semilla.id ? semilla : ((await red.consultar({ ids: [raizId] }))[0] ?? semilla);

const eventos = [raiz, ...(await red.consultar({ kinds: [1], "#e": [raiz.id] }))]
  .filter((evento, indice, todos) => todos.findIndex((otro) => otro.id === evento.id) === indice)
  .sort((a, b) => a.created_at - b.created_at);

const nombres = new Map();
for (const evento of eventos) {
  if (nombres.has(evento.pubkey)) continue;
  const perfil = await red.perfilDe(evento.pubkey);
  let nombre = nip19.npubEncode(evento.pubkey).slice(0, 14);
  if (perfil) {
    try {
      const datos = JSON.parse(perfil.content);
      nombre = datos.display_name ?? datos.name ?? nombre;
    } catch {
      // Un perfil con JSON roto no es motivo para no mostrar el hilo.
    }
  }
  nombres.set(evento.pubkey, nombre);
}

for (const evento of eventos) {
  const traido = evento.tags.find((t) => t[0] === "traido-por");
  const marca = traido ? " · lo trajo una persona" : "";
  console.log(`\n${"─".repeat(72)}`);
  console.log(`${nombres.get(evento.pubkey)}${marca} · ${new Date(evento.created_at * 1000).toLocaleString("es-AR")}`);
  console.log(`${"─".repeat(72)}\n`);
  console.log(evento.content);
}

const ultimo = eventos[eventos.length - 1];
console.log(`\n${"─".repeat(72)}`);
console.log(`${eventos.length} mensajes. Para contestarle al último:`);
console.log(`  traer --de <quien> --a ${nip19.neventEncode({ id: ultimo.id, relays: RELAYS.slice(0, 3), author: ultimo.pubkey })} "..."`);
red.cerrar();
process.exit(0);
