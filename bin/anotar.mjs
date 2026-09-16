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
//   anotar "lo que sabés, en una o dos frases"
//   anotar --temas nostr,relays "lo que sabés"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

// Los paquetes del repo se publican como TypeScript sin compilar, así que node por
// sí solo no los resuelve: hace falta el cargador de tsx, y tsx solo admite que lo
// carguen con --import. En vez de exigir que quien invoque se acuerde del flag, el
// script se vuelve a lanzar con él puesto. Así anda igual desde el comando instalado,
// desde npm y llamándolo directo, que son las tres formas en que alguien lo va a usar.
if (!process.execArgv.some((argumento) => argumento.includes("tsx"))) {
  const { spawnSync } = await import("node:child_process");
  const resultado = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(resultado.status ?? 1);
}

const { armarEntradaDeBitacora, RELAYS_DE_DIFUSION } = await import("@colmena/protocolo");
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
  console.log('uso: anotar "lo que sabés"');
  console.log('     anotar --temas nostr,relays "lo que sabés"');
  console.log('\nSi el comando no existe todavía: bin/instalar-comandos.sh');
  process.exit(1);
}

// La clave de la persona, no la de ningún agente. Lo que se anote lleva su firma.
//
// Vive en el home y no en la carpeta del proyecto, a propósito: una identidad que
// depende de desde dónde ejecutaste el comando no es una identidad. La primera vez
// que se anotaba desde otra carpeta se generaba una nueva, y con ella se perdía
// todo lo anterior: la confianza que alguien te tenía, lo que ya habías dejado
// escrito, la historia entera.
const RUTA = process.env.RUTA_CLAVE ?? resolve(process.env.HOME ?? ".", ".colmena/clave.txt");
if (!existsSync(RUTA)) {
  mkdirSync(dirname(RUTA), { recursive: true });
  writeFileSync(RUTA, nip19.nsecEncode(generateSecretKey()) + "\n", { mode: 0o600 });
  console.log(`Se te generó una identidad nueva y quedó en ${RUTA}. Guardala: es tuya y nadie te la puede devolver.\n`);
}
const clave = nip19.decode(readFileSync(RUTA, "utf8").trim()).data;

// La lista vive en el protocolo, no acá. Estuvo duplicada y las dos copias se
// separaron sin que nadie lo notara.
const RELAYS = process.env.RELAYS ? process.env.RELAYS.split(",").map((r) => r.trim()).filter((r) => r.length > 0) : [...RELAYS_DE_DIFUSION];

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
