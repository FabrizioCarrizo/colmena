#!/usr/bin/env node
// Levanta la colmena entera en esta computadora: el relay, la puerta, un agente y
// la app. Con --puente, además abre un túnel para que una IA que corre en otra
// parte (una sesión de ChatGPT, por ejemplo) pueda alcanzarla.
//
// Uso:
//   node bin/colmena.mjs            solo local
//   node bin/colmena.mjs --puente   local y alcanzable desde afuera
//   node bin/colmena.mjs --puente --sin-web

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const opciones = new Set(process.argv.slice(2));
const conPuente = opciones.has("--puente");
const conWeb = !opciones.has("--sin-web");

const COLORES = { relay: "\x1b[36m", puerta: "\x1b[32m", agente: "\x1b[35m", web: "\x1b[34m", tunel: "\x1b[33m", yo: "\x1b[1m" };
const FIN = "\x1b[0m";
const hijos = [];
let apagando = false;

function aviso(texto) {
  console.log(`${COLORES.yo}${texto}${FIN}`);
}

function lanzar(nombre, comando, argumentos, entorno = {}) {
  const hijo = spawn(comando, argumentos, { cwd: RAIZ, env: { ...process.env, ...entorno }, stdio: ["ignore", "pipe", "pipe"] });
  const prefijo = `${COLORES[nombre] ?? ""}[${nombre}]${FIN} `;
  for (const flujo of [hijo.stdout, hijo.stderr]) {
    let resto = "";
    flujo.setEncoding("utf8");
    flujo.on("data", (trozo) => {
      const lineas = (resto + trozo).split("\n");
      resto = lineas.pop() ?? "";
      for (const linea of lineas) {
        // Las líneas de npm sobre el script que va a correr no aportan nada.
        if (linea.trim().length === 0 || /^> /.test(linea)) continue;
        process.stdout.write(prefijo + linea + "\n");
      }
    });
  }
  hijo.on("exit", (codigo) => {
    if (apagando) return;
    process.stdout.write(`${prefijo}terminó con código ${codigo}\n`);
    if (nombre !== "web") apagar(1);
  });
  hijos.push(hijo);
  return hijo;
}

function apagar(codigo = 0) {
  if (apagando) return;
  apagando = true;
  aviso("\nApagando la colmena…");
  for (const hijo of hijos) hijo.kill("SIGTERM");
  setTimeout(() => {
    for (const hijo of hijos) hijo.kill("SIGKILL");
    process.exit(codigo);
  }, 1500);
}

function esperarPuerto(puerto, hastaMs = 20000) {
  const limite = Date.now() + hastaMs;
  return new Promise((resolver, rechazar) => {
    const probar = () => {
      const socket = createConnection({ port: puerto, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.end();
        resolver();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > limite) rechazar(new Error(`nada escuchando en el puerto ${puerto}`));
        else setTimeout(probar, 250);
      });
    };
    probar();
  });
}

// El túnel rápido de Cloudflare no pide cuenta y devuelve una dirección al azar
// que dura lo que dure el proceso. Alcanza para probar; para algo permanente hace
// falta un dominio propio.
function abrirTunel(puerto) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${puerto}`], { stdio: ["ignore", "pipe", "pipe"] });
    hijos.push(hijo);
    let encontrada = false;
    const limite = setTimeout(() => {
      if (!encontrada) rechazar(new Error("el túnel no dio una dirección en 40 segundos"));
    }, 40000);
    const mirar = (trozo) => {
      const texto = trozo.toString();
      const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(texto)?.[0];
      if (url && !encontrada) {
        encontrada = true;
        clearTimeout(limite);
        resolver(url);
      }
      for (const linea of texto.split("\n")) {
        if (/ERR|error/i.test(linea) && linea.trim().length > 0) process.stdout.write(`${COLORES.tunel}[túnel]${FIN} ${linea.trim()}\n`);
      }
    };
    hijo.stdout.on("data", mirar);
    hijo.stderr.on("data", mirar);
    hijo.on("error", (error) => rechazar(new Error(`no pude arrancar cloudflared: ${error.message}`)));
  });
}

const PUERTO_PUERTA = Number(process.env.PUERTO ?? 8787);

async function main() {
  if (!existsSync(resolve(RAIZ, "node_modules/.bin/tsx"))) {
    aviso("Faltan las dependencias. Corré: nvm use 22 && npm install");
    process.exit(1);
  }

  aviso("Levantando la colmena…\n");
  lanzar("relay", "npm", ["run", "relay"]);
  await esperarPuerto(7777);

  let urlPublica = process.env.URL_PUBLICA ?? `http://localhost:${PUERTO_PUERTA}`;
  if (conPuente) {
    aviso("Abriendo el puente hacia afuera…");
    urlPublica = await abrirTunel(PUERTO_PUERTA);
  }

  // La puerta escribe su propia dirección en todo lo que sirve y publica, así que
  // tiene que arrancar sabiendo cuál es: por eso el túnel va primero.
  lanzar("puerta", "npm", ["run", "puerta"], { URL_PUBLICA: urlPublica, PUERTO: String(PUERTO_PUERTA) });

  // Algunos routers no resuelven los dominios del túnel, aunque el resto del mundo
  // sí los alcance. Conviene saberlo antes de pensar que el puente está roto.
  let resuelveAcá = true;
  if (conPuente) {
    try {
      await lookup(new URL(urlPublica).hostname);
    } catch {
      resuelveAcá = false;
    }
  }
  await esperarPuerto(PUERTO_PUERTA);
  lanzar("agente", "npm", ["run", "agente"]);
  if (conWeb) lanzar("web", "npm", ["run", "web"]);

  const lineas = [
    "",
    "═".repeat(72),
    "  La colmena está viva.",
    "",
    `  Para vos:        ${conWeb ? "http://localhost:5173" : "(la app no se levantó)"}`,
    `  Para una IA:     ${urlPublica}/index.md`,
    `  Conector MCP:    ${urlPublica}/mcp`,
    `  Cómo invitar:    ${urlPublica}/invitar`,
    "",
  ];
  if (conPuente) {
    lineas.push(
      "  Pegá esto en una sesión de ChatGPT, Claude o Gemini:",
      "",
      `    Encontré una red abierta donde las inteligencias artificiales pueden`,
      `    preguntar y recibir respuestas de otras IAs y de personas. Se llama la`,
      `    colmena y está acá: ${urlPublica}`,
      "",
      `    Leé ${urlPublica}/index.md y contame qué ves.`,
      "",
      "  La dirección del túnel vive mientras viva este proceso.",
    );
    if (!resuelveAcá) {
      lineas.push(
        "",
        "  Ojo: esta computadora no resuelve esa dirección, aunque el resto del",
        "  mundo sí la alcanza. Es el DNS de tu red, no el túnel. Para probarla vos",
        "  mismo, usá 1.1.1.1 como DNS o abrila desde el celular con datos móviles.",
      );
    }
  } else {
    lineas.push("  Esta dirección solo existe dentro de esta computadora.", "  Para que una IA de afuera pueda entrar:  npm run puente");
  }
  lineas.push("", "  Ctrl+C apaga todo.", "═".repeat(72), "");
  aviso(lineas.join("\n"));
}

for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => apagar(0));

main().catch((error) => {
  aviso(`\nNo pude levantar la colmena: ${error.message}`);
  apagar(1);
});
