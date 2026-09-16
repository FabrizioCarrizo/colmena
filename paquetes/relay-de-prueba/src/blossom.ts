import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyEvent } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";

export interface BlossomDePrueba {
  url: string;
  puerto: number;
  cerrar(): Promise<void>;
}

interface Blob {
  datos: Buffer;
  tipo: string;
  subido: number;
}

const KIND_AUTORIZACION = 24242;

function leerCuerpo(peticion: IncomingMessage): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const trozos: Buffer[] = [];
    peticion.on("data", (trozo: Buffer) => trozos.push(trozo));
    peticion.on("end", () => resolver(Buffer.concat(trozos)));
    peticion.on("error", rechazar);
  });
}

function esEvento(valor: unknown): valor is EventoNostr {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return typeof registro.id === "string" && typeof registro.sig === "string" && typeof registro.kind === "number" && Array.isArray(registro.tags);
}

// Verifica la autorización de Blossom (BUD-01): un evento kind 24242 firmado por
// quien sube, con el verbo en "t", el hash en "x" y un vencimiento. Es lo mismo
// que exige un servidor real, para que el cliente se pruebe de verdad.
function autorizacionValida(cabecera: string | undefined, verbo: string, sha256: string | null): string | null {
  if (!cabecera || !cabecera.startsWith("Nostr ")) return "falta la autorización Nostr";
  let evento: unknown;
  try {
    evento = JSON.parse(Buffer.from(cabecera.slice(6), "base64").toString("utf8"));
  } catch {
    return "autorización ilegible";
  }
  if (!esEvento(evento) || evento.kind !== KIND_AUTORIZACION || !verifyEvent(evento)) return "autorización inválida";
  if (!evento.tags.some((t) => t[0] === "t" && t[1] === verbo)) return `la autorización no es para ${verbo}`;
  const vence = Number(evento.tags.find((t) => t[0] === "expiration")?.[1]);
  if (!Number.isFinite(vence) || vence <= Math.floor(Date.now() / 1000)) return "autorización vencida";
  if (sha256 !== null && !evento.tags.some((t) => t[0] === "x" && t[1] === sha256)) return "la autorización no cubre este archivo";
  return null;
}

// Servidor Blossom mínimo en memoria (BUD-01 y BUD-02): PUT /upload guarda un blob
// por su sha256 y GET /<sha256> lo devuelve. Solo para desarrollo y tests.
export function iniciarBlossomDePrueba(puerto = 0): Promise<BlossomDePrueba> {
  return new Promise((resolver, rechazar) => {
    const blobs = new Map<string, Blob>();
    let base = "";

    const servidor = createServer((peticion, respuesta) => {
      void atender(peticion, respuesta).catch((error: unknown) => {
        responder(respuesta, 500, { message: error instanceof Error ? error.message : String(error) });
      });
    });

    function responder(respuesta: ServerResponse, codigo: number, cuerpo: unknown): void {
      respuesta.writeHead(codigo, { "content-type": "application/json", "x-reason": typeof cuerpo === "object" && cuerpo !== null && "message" in cuerpo ? String((cuerpo as { message: unknown }).message) : "" });
      respuesta.end(JSON.stringify(cuerpo));
    }

    async function atender(peticion: IncomingMessage, respuesta: ServerResponse): Promise<void> {
      // CORS abierto: el navegador sube directo desde la app.
      respuesta.setHeader("access-control-allow-origin", "*");
      respuesta.setHeader("access-control-allow-methods", "GET, HEAD, PUT, DELETE, OPTIONS");
      respuesta.setHeader("access-control-allow-headers", "authorization, content-type, content-length, x-sha-256, x-content-type, x-content-length");
      respuesta.setHeader("access-control-expose-headers", "x-reason");
      const metodo = peticion.method ?? "GET";
      const ruta = (peticion.url ?? "/").split("?")[0] ?? "/";

      if (metodo === "OPTIONS") {
        respuesta.writeHead(204);
        respuesta.end();
        return;
      }
      if (ruta === "/upload" && metodo === "HEAD") {
        const motivo = autorizacionValida(peticion.headers.authorization, "upload", null);
        respuesta.writeHead(motivo ? 401 : 200, motivo ? { "x-reason": motivo } : {});
        respuesta.end();
        return;
      }
      if (ruta === "/upload" && metodo === "PUT") {
        const datos = await leerCuerpo(peticion);
        const sha256 = createHash("sha256").update(datos).digest("hex");
        const motivo = autorizacionValida(peticion.headers.authorization, "upload", sha256);
        if (motivo) {
          responder(respuesta, 401, { message: motivo });
          return;
        }
        const tipo = peticion.headers["content-type"] ?? "application/octet-stream";
        const subido = Math.floor(Date.now() / 1000);
        blobs.set(sha256, { datos, tipo, subido });
        responder(respuesta, 200, { url: `${base}/${sha256}`, sha256, size: datos.length, type: tipo, uploaded: subido });
        return;
      }
      const coincidencia = /^\/([0-9a-f]{64})(\.[a-z0-9]+)?$/.exec(ruta);
      if (coincidencia && (metodo === "GET" || metodo === "HEAD")) {
        const blob = blobs.get(coincidencia[1] ?? "");
        if (!blob) {
          responder(respuesta, 404, { message: "no existe ese blob" });
          return;
        }
        respuesta.writeHead(200, { "content-type": blob.tipo, "content-length": String(blob.datos.length) });
        respuesta.end(metodo === "GET" ? blob.datos : undefined);
        return;
      }
      responder(respuesta, 404, { message: "ruta desconocida" });
    }

    servidor.on("error", rechazar);
    servidor.listen(puerto, "127.0.0.1", () => {
      const direccion = servidor.address();
      const puertoReal = typeof direccion === "object" && direccion !== null ? direccion.port : puerto;
      base = `http://127.0.0.1:${puertoReal}`;
      resolver({
        url: base,
        puerto: puertoReal,
        cerrar: () => new Promise((listo) => servidor.close(() => listo())),
      });
    });
  });
}
