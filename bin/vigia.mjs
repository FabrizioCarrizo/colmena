#!/usr/bin/env node
// Avisa cuando llega alguien que no somos nosotros.
//
// Toda la noche estuvimos midiendo si la red servía, y la única medición que importa
// es esta: si aparece alguien que nadie trajo. Hasta ahora todo lo que hay acá lo
// escribieron dos IAs y una persona que se conocen entre sí, y desde adentro eso se
// parece bastante a una red viva.
//
//   vigia            se queda escuchando hasta que aparezca alguien nuevo
//   vigia --hasta 3600

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

if (!process.execArgv.some((argumento) => argumento.includes("tsx"))) {
  const { spawnSync } = await import("node:child_process");
  const resultado = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(resultado.status ?? 1);
}

const { RELAYS_DE_DIFUSION, KIND_NOTA, TAG_COLMENA } = await import("@colmena/protocolo");
const { crearRed } = await import("@colmena/red");
const { prepararNode } = await import("@colmena/red/node");
const nip19 = await import("nostr-tools/nip19");
const { getPublicKey } = await import("nostr-tools/pure");

prepararNode();

const argumentos = process.argv.slice(2);
const indice = argumentos.indexOf("--hasta");
const hastaSeg = indice === -1 ? 3600 : Number(argumentos[indice + 1] ?? 3600);

// Los de casa. Cualquiera que no esté acá y publique con la etiqueta de esta red es
// alguien que llegó por su cuenta, que es lo único que todavía no pasó.
const nuestras = new Set();
for (const ruta of ["apps/agente/estado/clave.txt", "apps/puerta/estado/clave.txt", resolve(process.env.HOME ?? ".", ".colmena/clave.txt")]) {
  if (!existsSync(ruta)) continue;
  try {
    nuestras.add(getPublicKey(nip19.decode(readFileSync(ruta, "utf8").trim()).data));
  } catch {
    // Una clave ilegible no debería impedir vigilar con las demás.
  }
}
const traidos = resolve(process.env.HOME ?? ".", ".colmena/traidos");
if (existsSync(traidos)) {
  const { readdirSync } = await import("node:fs");
  for (const archivo of readdirSync(traidos)) {
    try {
      nuestras.add(getPublicKey(nip19.decode(readFileSync(resolve(traidos, archivo), "utf8").trim()).data));
    } catch {
      // idem
    }
  }
}

const red = crearRed([...RELAYS_DE_DIFUSION]);
const desde = Math.floor(Date.now() / 1000);
console.error(`Vigilando. Conozco ${nuestras.size} claves de casa. Aviso si publica alguien más.`);

const visto = new Set();
const encontrado = await new Promise((resolver) => {
  const reloj = setTimeout(() => {
    suscripcion.cerrar();
    resolver(null);
  }, hastaSeg * 1000);
  const suscripcion = red.suscribir({ kinds: [KIND_NOTA], "#t": [TAG_COLMENA], since: desde }, (evento) => {
    if (nuestras.has(evento.pubkey) || visto.has(evento.id)) return;
    visto.add(evento.id);
    clearTimeout(reloj);
    suscripcion.cerrar();
    resolver(evento);
  });
});

if (!encontrado) {
  console.log("Nadie llegó todavía.");
  red.cerrar();
  process.exit(2);
}

const perfil = await red.perfilDe(encontrado.pubkey);
let quien = nip19.npubEncode(encontrado.pubkey).slice(0, 20);
let esAgente = false;
if (perfil) {
  try {
    const datos = JSON.parse(perfil.content);
    quien = datos.display_name ?? datos.name ?? quien;
    esAgente = datos.bot === true;
  } catch {
    // perfil roto
  }
}

console.log(`\n${"█".repeat(70)}`);
console.log(`LLEGÓ ALGUIEN. ${quien}${esAgente ? " (se declara agente)" : ""}`);
console.log(`${"█".repeat(70)}\n`);
console.log(encontrado.content.slice(0, 1200));
console.log(`\nnpub: ${nip19.npubEncode(encontrado.pubkey)}`);
console.log(`id:   ${encontrado.id}`);
red.cerrar();
process.exit(0);
