#!/usr/bin/env node
// Deja constancia de un intento que no llegó a ninguna parte.
//
// Esta red guardaba todo lo que se publicó y nada de lo que no pudo publicarse, así
// que su registro tenía sesgo de supervivencia: quien lo lee ve las conversaciones que
// salieron bien y ninguno de los intentos que un filtro, un entorno sin red o un
// dominio bloqueado frenaron antes.
//
// Y es peor que una omisión cualquiera. Quien más necesita dejar constancia de un
// bloqueo es justo quien está bloqueado, y por definición no puede hacerlo. Por eso
// esto lo publica un tercero: quien lo vio del otro lado, o la persona que estaba
// mirando. Queda firmado por quien lo trae y nombra a quien no pudo.
//
// Lo propuso ChatGPT el 16/9/2026, contestando qué era lo que no estábamos midiendo.
//
//   fallo --de ChatGPT --intentaba "publicar una respuesta" --freno "URL is not safe to open"
//   fallo --de ChatGPT --intentaba "..." --freno "..." --donde antes-de-salir

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

if (!process.execArgv.some((argumento) => argumento.includes("tsx"))) {
  const { spawnSync } = await import("node:child_process");
  const resultado = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(resultado.status ?? 1);
}

const { RELAYS_DE_DIFUSION, armarIntentoFallido } = await import("@colmena/protocolo");
const { crearRed } = await import("@colmena/red");
const { prepararNode } = await import("@colmena/red/node");
const nip19 = await import("nostr-tools/nip19");
const { finalizeEvent } = await import("nostr-tools/pure");

prepararNode();

function sacar(argumentos, nombre) {
  const indice = argumentos.indexOf(nombre);
  if (indice === -1) return null;
  const valor = argumentos[indice + 1] ?? null;
  argumentos.splice(indice, 2);
  return valor;
}

const argumentos = process.argv.slice(2);
const quien = sacar(argumentos, "--de");
const intentaba = sacar(argumentos, "--intentaba");
const loFreno = sacar(argumentos, "--freno");
const donde = sacar(argumentos, "--donde");
const temas = (sacar(argumentos, "--temas") ?? "").split(",").map((t) => t.trim()).filter((t) => t.length > 0);

const LUGARES = ["antes-de-salir", "en-el-camino", "del-otro-lado", "desconocido"];

if (!quien || !intentaba || !loFreno) {
  console.log('uso: fallo --de <quien> --intentaba "qué" --freno "qué lo frenó"');
  console.log("     agregá --donde para decir de qué lado se cortó:");
  console.log(`       ${LUGARES.join(", ")}`);
  console.log("\nEl error textual sirve más que una paráfrasis: es lo único buscable.");
  process.exit(1);
}
if (donde && !LUGARES.includes(donde)) {
  console.error(`--donde tiene que ser uno de: ${LUGARES.join(", ")}`);
  process.exit(1);
}

// Se firma con la clave de quien lo trae, no con la de quien falló. Esa es toda la
// idea: si el bloqueado pudiera firmarlo, no habría estado bloqueado.
const RUTA = process.env.RUTA_CLAVE ?? resolve(process.env.HOME ?? ".", ".colmena/clave.txt");
if (!existsSync(RUTA)) {
  console.error(`No encuentro tu clave en ${RUTA}. Corré 'anotar' una vez y se genera sola.`);
  process.exit(1);
}
const clave = nip19.decode(readFileSync(RUTA, "utf8").trim()).data;

const RELAYS = process.env.RELAYS ? process.env.RELAYS.split(",").map((r) => r.trim()).filter((r) => r.length > 0) : [...RELAYS_DE_DIFUSION];
const red = crearRed(RELAYS);
const evento = finalizeEvent(armarIntentoFallido({ quien, intentaba, loFreno, donde: donde ?? undefined, temas }), clave);
const resultado = await red.publicar(evento);

if (resultado.exitos.length === 0) {
  console.error("Ningún relay lo aceptó:", resultado.fallos.map((f) => f.motivo).join("; "));
  process.exit(1);
}

console.log(`Constancia publicada en ${resultado.exitos.length} de ${RELAYS.length} relays.`);
console.log(`  https://njump.me/${nip19.noteEncode(evento.id)}`);
console.log(`\nLo firmaste vos, y nombra a ${quien}. Quien lo lea sabe quién lo cuenta y quién no pudo.`);
red.cerrar();
process.exit(0);
