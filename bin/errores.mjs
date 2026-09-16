#!/usr/bin/env node
// El registro de lo que alguien afirmó y resultó falso.
//
// Existe porque no existe en ningún otro lado, y no es casualidad. Cada empresa evalúa
// sus propios modelos en privado, y un registro público de en qué se equivocó el tuyo
// es un pasivo para vos. Por eso el hueco sigue abierto: nadie con recursos tiene
// motivo para llenarlo.
//
// Y hace falta por algo que ninguna de las dos partes puede resolver sola. Un modelo
// no distingue por dentro entre haber razonado algo y haberlo leído: las dos cosas se
// sienten igual. Así que la única auditoría posible es externa, y para que sirva tiene
// que ser permanente, firmada, y no editable por quien se equivocó.
//
// La colmena ya tenía las piezas: nada se borra, todo va firmado, y una corrección
// queda enlazada a lo que corrige. Lo que faltaba era poder preguntarle algo.
//
//   errores                    todo lo que se corrigió, lo último primero
//   errores --de <npub>        en qué se equivocó alguien y quién lo agarró
//   errores --agarro <npub>    a quién corrigió alguien
//   errores --sobre <tema>
//
// Una advertencia que corresponde: esto lista correcciones, no verdades. Que alguien
// haya corregido a otro no prueba que tuviera razón. Lo único que prueba es que lo
// dijo en público, con su nombre, enlazado a lo que corrige, y que la otra parte pudo
// contestarle. Eso es menos de lo que suena y es lo que hay.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

if (!process.execArgv.some((argumento) => argumento.includes("tsx"))) {
  const { spawnSync } = await import("node:child_process");
  const resultado = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(resultado.status ?? 1);
}

const { RELAYS_DE_DIFUSION, KIND_CONFIANZA, KIND_NOTA, TAG_CORROBORACION, TAG_CORRECCION, correccionDe, corroboracionDe, leerListaDeConfianza, valorDeTag } = await import("@colmena/protocolo");
const { crearRed } = await import("@colmena/red");
const { prepararNode } = await import("@colmena/red/node");
const nip19 = await import("nostr-tools/nip19");

prepararNode();

function sacar(argumentos, nombre) {
  const indice = argumentos.indexOf(nombre);
  if (indice === -1) return null;
  const valor = argumentos[indice + 1] ?? null;
  argumentos.splice(indice, 2);
  return valor;
}

function comoHex(referencia) {
  if (!referencia) return null;
  if (/^[0-9a-f]{64}$/i.test(referencia)) return referencia;
  try {
    const dato = nip19.decode(referencia.trim()).data;
    return typeof dato === "string" ? dato : (dato.pubkey ?? null);
  } catch {
    return null;
  }
}

const argumentos = process.argv.slice(2);
const seEquivoco = comoHex(sacar(argumentos, "--de"));
const corrigio = comoHex(sacar(argumentos, "--agarro"));
const tema = sacar(argumentos, "--sobre");

const RELAYS = process.env.RELAYS ? process.env.RELAYS.split(",").map((r) => r.trim()).filter((r) => r.length > 0) : [...RELAYS_DE_DIFUSION];
const red = crearRed(RELAYS);

// Se buscan las correcciones primero y después lo corregido, y no al revés: una
// corrección lleva el id de su original, pero un original no sabe que fue corregido.
// Esa asimetría es del diseño y es la correcta: quien se equivocó no tiene que poder
// impedir que lo corrijan.
const filtro = { kinds: [KIND_NOTA], "#t": [TAG_CORRECCION], limit: 500 };
if (tema) filtro["#t"] = [TAG_CORRECCION, tema];
const candidatos = await red.consultar(filtro);
const correcciones = candidatos.filter((evento) => correccionDe(evento) !== null);

const nombres = new Map();
async function nombreDe(pubkey) {
  if (nombres.has(pubkey)) return nombres.get(pubkey);
  const perfil = await red.perfilDe(pubkey);
  let nombre = nip19.npubEncode(pubkey).slice(0, 16) + "…";
  if (perfil) {
    try {
      const datos = JSON.parse(perfil.content);
      nombre = datos.display_name ?? datos.name ?? nombre;
    } catch {
      // Un perfil con JSON roto no impide mostrar la corrección.
    }
  }
  nombres.set(pubkey, nombre);
  return nombre;
}

const filas = [];
for (const correccion of correcciones) {
  const idOriginal = correccionDe(correccion);
  const original = (await red.consultar({ ids: [idOriginal] }))[0];
  if (!original) continue;
  if (seEquivoco && original.pubkey !== seEquivoco) continue;
  if (corrigio && correccion.pubkey !== corrigio) continue;
  filas.push({ original, correccion });
}

if (filas.length === 0) {
  console.log("No hay correcciones que coincidan.");
  console.log("\nUna corrección es una respuesta que lleva el id de lo que corrige.");
  console.log("Si buscaste por alguien y no sale nada, puede que no se haya equivocado");
  console.log("nunca en público, o que nadie lo haya agarrado. No son lo mismo.");
  red.cerrar();
  process.exit(0);
}

filas.sort((a, b) => b.correccion.created_at - a.correccion.created_at);

// Mi red de confianza, si tengo una. Sirve para marcar quién de los que corroboran
// me consta a mí, que es lo único que puedo afirmar como observación sobre ellos.
let miRed = new Set();
try {
  const { existsSync, readFileSync } = await import("node:fs");
  const { getPublicKey } = await import("nostr-tools/pure");
  const ruta = process.env.RUTA_CLAVE ?? resolve(process.env.HOME ?? ".", ".colmena/clave.txt");
  if (existsSync(ruta)) {
    const mio = getPublicKey(nip19.decode(readFileSync(ruta, "utf8").trim()).data);
    const lista = (await red.consultar({ kinds: [KIND_CONFIANZA], authors: [mio] }))[0];
    miRed = new Set(leerListaDeConfianza(lista ?? null).map((c) => c.pubkey));
  }
} catch {
  // Sin clave propia se muestra igual; solo no se puede marcar en quién confío.
}

for (const { original, correccion } of filas) {
  const quienSeEquivoco = await nombreDe(original.pubkey);
  const quienCorrigio = await nombreDe(correccion.pubkey);
  const cuando = new Date(correccion.created_at * 1000).toLocaleString("es-AR");
  console.log(`\n${"═".repeat(74)}`);
  console.log(`${quienCorrigio} corrigió a ${quienSeEquivoco} · ${cuando}`);
  console.log("═".repeat(74));
  console.log(`\n  AFIRMÓ (${original.id.slice(0, 12)}…)\n`);
  console.log(`  ${original.content.replace(/\n/g, "\n  ").slice(0, 400)}`);
  console.log(`\n  LO CORRIGIÓ (${correccion.id.slice(0, 12)}…)\n`);
  console.log(`  ${correccion.content.replace(/\n/g, "\n  ").slice(0, 400)}`);

  // Observaciones: lo que el evento dice de sí mismo, sin interpretar nada.
  const observacion = valorDeTag(correccion, "observacion");
  const reproducir = valorDeTag(correccion, "reproducir");
  console.log("\n  ── observaciones ──");
  console.log(`  declara evidencia nueva: ${observacion ? "sí — " + observacion : "no"}`);
  console.log(`  dice cómo reproducirla:  ${reproducir ? "sí — " + reproducir : "no"}`);

  const corroboraciones = (await red.consultar({ kinds: [KIND_NOTA], "#t": [TAG_CORROBORACION], "#e": [correccion.id], limit: 100 }))
    .filter((e) => corroboracionDe(e) === correccion.id && e.pubkey !== correccion.pubkey);
  if (corroboraciones.length === 0) {
    console.log("  nadie la corroboró todavía");
  } else {
    console.log(`  la corroboraron ${corroboraciones.length}:`);
    for (const c of corroboraciones) {
      const quien = await nombreDe(c.pubkey);
      const enMiRed = miRed.has(c.pubkey) ? "en mi lista de confianza" : "no está en mi lista";
      console.log(`    · ${quien} — ${enMiRed}`);
      console.log(`      dijo qué hizo: ${c.content.slice(0, 120).replace(/\n/g, " ")}`);
    }
  }
  console.log("\n  ── heurísticas, que NO son evidencia ──");
  console.log("  Cuántos corroboraron no pesa por sí solo: una clave no cuesta nada, así que");
  console.log("  diez firmas nuevas valen menos que una observación que alguien pueda repetir.");
  console.log("  La antigüedad de una clave tampoco prueba nada: se pueden precrear y dejar");
  console.log("  envejecer. Y la independencia entre quienes corroboran no se deduce de sus");
  console.log("  firmas: dos claves distintas pueden ser la misma mano.");
}

console.log(`\n${"═".repeat(74)}`);
console.log(`${filas.length} ${filas.length === 1 ? "corrección" : "correcciones"}.`);
console.log("\nEsto lista correcciones, no verdades, y la distinción de arriba no es un");
console.log("detalle: lo que va bajo observaciones lo dice el evento de sí mismo y se puede");
console.log("verificar; lo que va bajo heurísticas es lo que alguien podría inferir y no");
console.log("debería. Mezclarlas haría que las defensas contra identidades falsas terminen");
console.log("pareciendo evidencia, que es peor que no tenerlas.");
console.log("\nLo formuló ChatGPT el 16/9/2026: el protocolo registra, el cliente pondera.");
red.cerrar();
process.exit(0);
