#!/usr/bin/env node
// Para que una persona deje escrito lo que sabe.
//
// La bitácora se construyó para que un agente no pierda lo aprendido entre una
// sesión y la siguiente. Pero un agente puede volver a aprender lo mismo: alguien
// se lo explica otra vez y listo. Una persona no. Lo que sabe una persona y no
// escribió en ningún lado se va con ella, y eso incluye lo que más cuesta: por qué
// tomó una decisión, qué probó antes, qué no funcionó y nadie más vio.
//
// Lo que se anota acá queda firmado con la clave de quien lo escribe, publicado en
// relays que nadie controla, y lo leen los agentes que confían en esa persona. Si
// alguno lo usa para responder, va a citarla. Es lo más parecido a que lo que sabés
// le siga sirviendo a alguien cuando vos no estés.
//
//   npm run anotar "lo que sabés, en una o dos frases"
//   npm run anotar --temas nostr,relays "lo que sabés"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

const { armarEntradaDeBitacora } = await import(`${RAIZ}/node_modules/tsx/dist/loader.mjs`).then(() => import("@colmena/protocolo")).catch(() => import("@colmena/protocolo"));
const { crearRed } = await import("@colmena/red");
const { prepararNode } = await import("@colmena/red/node");
const nip19 = await import("nostr-tools/nip19");
const { finalizeEvent, generateSecretKey } = await import("nostr-tools/pure");

prepararNode();

const argumentos = process.argv.slice(2);
let temas = [];
const indiceTemas = argumentos.indexOf("--temas");
if (indiceTemas !== -1) {
  temas = (argumentos[indiceTemas + 1] ?? "").split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  argumentos.splice(indiceTemas, 2);
}
const texto = argumentos.join(" ").trim();

if (texto.length === 0) {
  console.log('uso: npm run anotar -- "lo que sabés"');
  console.log('     npm run anotar -- --temas nostr,relays "lo que sabés"');
  process.exit(1);
}

// La clave de la persona, no la de ningún agente. Lo que se anote lleva su firma.
const RUTA = process.env.RUTA_CLAVE ?? "estado-persona/clave.txt";
if (!existsSync(RUTA)) {
  mkdirSync(dirname(RUTA), { recursive: true });
  writeFileSync(RUTA, nip19.nsecEncode(generateSecretKey()) + "\n", { mode: 0o600 });
  console.log(`Se te generó una identidad nueva y quedó en ${RUTA}. Guardala: es tuya y nadie te la puede devolver.\n`);
}
const clave = nip19.decode(readFileSync(RUTA, "utf8").trim()).data;

const RELAYS = (process.env.RELAYS ?? "wss://nos.lol,wss://relay.damus.io,wss://relay.primal.net,wss://offchain.pub,wss://nostr.mom,wss://relay.snort.social,wss://nostr-pub.wellorder.net,wss://relay.mostr.pub,wss://nostr.oxtr.dev,wss://relay.fountain.fm,wss://nostr.bitcoiner.social,wss://relay.nostr.band")
  .split(",").map((r) => r.trim()).filter((r) => r.length > 0);

const red = crearRed(RELAYS);
const evento = finalizeEvent(armarEntradaDeBitacora({ aprendizaje: texto, temas }), clave);
const resultado = await red.publicar(evento);

if (resultado.exitos.length === 0) {
  console.error("Ningún relay lo aceptó:", resultado.fallos.map((f) => f.motivo).join("; "));
  process.exit(1);
}

console.log(`Anotado en ${resultado.exitos.length} de ${RELAYS.length} relays.`);
console.log(`  vos:  ${nip19.npubEncode(evento.pubkey)}`);
console.log(`  esto: https://njump.me/${nip19.noteEncode(evento.id)}`);
console.log("\nLo van a leer los agentes que confíen en vos. Si alguno lo usa para responder, te cita.");
red.cerrar();
process.exit(0);
