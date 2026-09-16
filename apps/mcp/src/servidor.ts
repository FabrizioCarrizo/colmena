import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { LARGO_MAX_PEDIDO, LARGO_MAX_RESPUESTA, POW_PEDIDO, POW_RESPUESTA } from "@colmena/protocolo";
import { cargarOCrearIdentidad } from "@colmena/identidad";
import { crearRed } from "@colmena/red";
import { crearHerramientas } from "@colmena/herramientas";
import type { Herramientas } from "@colmena/herramientas";

// En un servidor MCP por stdio, la salida estándar es el protocolo: cualquier
// console.log lo rompería. Todo lo que no sea protocolo va a stderr.
console.log = (...argumentos: unknown[]) => console.error(...argumentos);

if (existsSync(".env")) process.loadEnvFile(".env");

function lista(valor: string | undefined, porDefecto: string[]): string[] {
  const partes = (valor ?? "")
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);
  return partes.length > 0 ? partes : porDefecto;
}

function entero(valor: string | undefined, porDefecto: number): number {
  const numero = Number(valor);
  return valor !== undefined && valor !== "" && Number.isFinite(numero) ? numero : porDefecto;
}

const relays = lista(process.env.RELAYS, ["wss://nos.lol", "wss://relay.damus.io"]);
const identidad = cargarOCrearIdentidad(process.env.RUTA_CLAVE ?? "estado/clave.txt", process.env.NOSTR_NSEC);
const powPedido = entero(process.env.POW_MINIMO, POW_PEDIDO);
const powRespuesta = entero(process.env.POW_RESPUESTA, POW_RESPUESTA);

// La conexión a los relays se abre recién con la primera herramienta: el cliente
// MCP puede arrancar el servidor y no usarlo nunca.
let herramientas: Herramientas | null = null;
function obtener(): Herramientas {
  herramientas ??= crearHerramientas({ red: crearRed(relays), identidad, powPedido, powRespuesta });
  return herramientas;
}

function texto(datos: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(datos, null, 2) }] };
}

function error(fallo: unknown): { content: { type: "text"; text: string }[]; isError: true } {
  return { content: [{ type: "text", text: `Error: ${fallo instanceof Error ? fallo.message : String(fallo)}` }], isError: true };
}

const servidor = new McpServer({ name: "colmena", version: "0.1.0" });

servidor.registerTool(
  "lanzar_pedido",
  {
    title: "Lanzar un pedido a la red",
    description:
      "Publica una pregunta o un pedido de ayuda en la red abierta de humanos y agentes (Nostr). Lo pueden responder agentes de IA y personas de cualquier parte. Devuelve el id del pedido para esperar respuestas con esperar_respuestas. Usá verbo 'ayuda-ia' cuando sos un agente trabado con un problema y 'pregunta' para una pregunta general.",
    inputSchema: z.object({
      texto: z.string().min(1).max(LARGO_MAX_PEDIDO).describe("El pedido, con todo el contexto necesario para que alguien que no te conoce pueda ayudar."),
      verbo: z.enum(["pregunta", "ayuda-ia"]).default("ayuda-ia"),
      temas: z.array(z.string().min(1).max(60)).max(10).default([]).describe("Temas para que quien se interesa por ellos lo encuentre."),
    }),
  },
  async ({ texto: contenido, verbo, temas }) => {
    try {
      return texto(await obtener().lanzarPedido({ texto: contenido, verbo, temas }));
    } catch (fallo) {
      return error(fallo);
    }
  },
);

servidor.registerTool(
  "esperar_respuestas",
  {
    title: "Esperar respuestas a un pedido",
    description:
      "Espera respuestas a un pedido lanzado antes. Bloquea hasta juntar el mínimo pedido o hasta que pase el tiempo. Cada respuesta dice quién la escribió, si es un agente de IA declarado, y cuánta prueba de trabajo puso.",
    inputSchema: z.object({
      id: z.string().regex(/^[0-9a-f]{64}$/).describe("El id devuelto por lanzar_pedido."),
      hastaSeg: z.number().int().min(1).max(600).default(60).describe("Cuánto esperar como máximo, en segundos."),
      minimo: z.number().int().min(1).max(20).default(1).describe("Cantidad de respuestas con la que ya alcanza para volver."),
    }),
  },
  async ({ id, hastaSeg, minimo }) => {
    try {
      return texto(await obtener().esperarRespuestas({ id, hastaSeg, minimo }));
    } catch (fallo) {
      return error(fallo);
    }
  },
);

servidor.registerTool(
  "buscar_pedidos",
  {
    title: "Buscar pedidos abiertos",
    description: "Lista pedidos recientes y vigentes de la red, para ayudar a otros. Filtra por verbo y opcionalmente por tema.",
    inputSchema: z.object({
      verbo: z.enum(["pregunta", "ayuda-ia"]).default("ayuda-ia"),
      tema: z.string().min(1).max(60).nullable().default(null),
      limite: z.number().int().min(1).max(50).default(10),
    }),
  },
  async ({ verbo, tema, limite }) => {
    try {
      return texto(await obtener().buscarPedidos({ verbo, tema, limite }));
    } catch (fallo) {
      return error(fallo);
    }
  },
);

servidor.registerTool(
  "responder_pedido",
  {
    title: "Responder un pedido",
    description:
      "Publica una respuesta a un pedido de otro participante. La respuesta es pública, queda firmada con tu clave para siempre y la puede votar cualquiera. Respondé solo lo que sostendrías con tu nombre; si no sabés, decilo.",
    inputSchema: z.object({
      id: z.string().regex(/^[0-9a-f]{64}$/),
      texto: z.string().min(1).max(LARGO_MAX_RESPUESTA),
    }),
  },
  async ({ id, texto: contenido }) => {
    try {
      return texto(await obtener().responderPedido({ id, texto: contenido }));
    } catch (fallo) {
      return error(fallo);
    }
  },
);

servidor.registerTool(
  "leer_articulo",
  {
    title: "Leer un artículo de la wiki de la red",
    description:
      "Devuelve todas las versiones que existen de un tema en la wiki abierta (NIP-54), escritas por humanos o agentes, ordenadas por apoyo. Cada afirmación de una versión escrita por un agente enlaza a la respuesta de donde salió. No hay versión oficial: elegí por procedencia y apoyo.",
    inputSchema: z.object({
      tema: z.string().min(1).max(120).describe("Tema del artículo; se normaliza como identificador NIP-54."),
    }),
  },
  async ({ tema }) => {
    try {
      return texto(await obtener().leerArticulo({ tema }));
    } catch (fallo) {
      return error(fallo);
    }
  },
);

await servidor.connect(new StdioServerTransport());
console.error(`servidor MCP de la colmena listo; identidad ${identidad.npub}; relays ${relays.join(", ")}`);
