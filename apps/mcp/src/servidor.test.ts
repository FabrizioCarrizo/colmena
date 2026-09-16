import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { iniciarRelayDePrueba } from "@botella/relay-de-prueba";
import type { RelayDePrueba } from "@botella/relay-de-prueba";

interface RespuestaJsonRpc {
  id?: number;
  result?: unknown;
  error?: unknown;
}

let relay: RelayDePrueba;
let proceso: ChildProcessWithoutNullStreams;
const recibidas = new Map<number, RespuestaJsonRpc>();
let acumulado = "";

function enviar(mensaje: Record<string, unknown>): void {
  proceso.stdin.write(`${JSON.stringify(mensaje)}\n`);
}

function esperarRespuesta(id: number, timeoutMs = 15000): Promise<RespuestaJsonRpc> {
  return new Promise((resolver, rechazar) => {
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      const respuesta = recibidas.get(id);
      if (respuesta) {
        clearInterval(intervalo);
        resolver(respuesta);
      } else if (Date.now() - inicio > timeoutMs) {
        clearInterval(intervalo);
        rechazar(new Error(`sin respuesta para el id ${id}`));
      }
    }, 50);
  });
}

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  const raiz = resolve(import.meta.dirname, "../../..");
  const carpetaEstado = mkdtempSync(join(tmpdir(), "botella-mcp-"));
  proceso = spawn(join(raiz, "node_modules/.bin/tsx"), ["src/servidor.ts"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, RELAYS: relay.url, RUTA_CLAVE: join(carpetaEstado, "clave.txt"), POW_MINIMO: "4", POW_RESPUESTA: "2" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  proceso.stdout.on("data", (trozo: Buffer) => {
    acumulado += trozo.toString();
    const lineas = acumulado.split("\n");
    acumulado = lineas.pop() ?? "";
    for (const linea of lineas) {
      if (linea.trim().length === 0) continue;
      const mensaje: unknown = JSON.parse(linea);
      if (typeof mensaje === "object" && mensaje !== null && typeof (mensaje as RespuestaJsonRpc).id === "number") {
        const respuesta = mensaje as RespuestaJsonRpc;
        recibidas.set(respuesta.id ?? -1, respuesta);
      }
    }
  });
});

afterAll(async () => {
  proceso.kill();
  await relay.cerrar();
});

describe("servidor MCP por stdio", () => {
  it("negocia el protocolo y expone las herramientas de la red", async () => {
    enviar({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    const inicio = await esperarRespuesta(1);
    expect(inicio.error).toBeUndefined();
    expect(inicio.result).toMatchObject({ serverInfo: { name: "botella" } });

    enviar({ jsonrpc: "2.0", method: "notifications/initialized" });
    enviar({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const lista = await esperarRespuesta(2);
    const herramientas = (lista.result as { tools: { name: string }[] }).tools.map((h) => h.name).sort();
    expect(herramientas).toEqual(["buscar_pedidos", "esperar_respuestas", "lanzar_pedido", "leer_articulo", "responder_pedido"]);
  });

  it("lanza un pedido de verdad a través del protocolo", async () => {
    enviar({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "lanzar_pedido", arguments: { texto: "¿Alguien sabe por qué mi relay no responde EOSE?", verbo: "ayuda-ia", temas: ["nostr"] } } });
    const respuesta = await esperarRespuesta(3);
    expect(respuesta.error).toBeUndefined();
    const resultado = respuesta.result as { content: { type: string; text: string }[]; isError?: boolean };
    expect(resultado.isError).toBeFalsy();
    const datos: unknown = JSON.parse(resultado.content[0]?.text ?? "{}");
    expect(datos).toMatchObject({ relays: [relay.url] });
    const id = (datos as { id: string }).id;
    expect(relay.eventos().some((e) => e.id === id)).toBe(true);
  });
});
