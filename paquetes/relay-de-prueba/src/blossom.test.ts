import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { iniciarBlossomDePrueba } from "./blossom";
import type { BlossomDePrueba } from "./blossom";

let blossom: BlossomDePrueba;
const clave = generateSecretKey();
const datos = Buffer.from("una imagen de mentira");
const sha256 = createHash("sha256").update(datos).digest("hex");

function autorizacion(verbo: string, hash: string, vidaSeg = 60): string {
  const ahora = Math.floor(Date.now() / 1000);
  const evento = finalizeEvent({ kind: 24242, content: "subir", created_at: ahora, tags: [["t", verbo], ["x", hash], ["expiration", String(ahora + vidaSeg)]] }, clave);
  return `Nostr ${Buffer.from(JSON.stringify(evento)).toString("base64")}`;
}

beforeAll(async () => {
  blossom = await iniciarBlossomDePrueba();
});

afterAll(async () => {
  await blossom.cerrar();
});

describe("servidor Blossom de prueba", () => {
  it("acepta una subida autorizada y devuelve el blob por su hash", async () => {
    const subida = await fetch(`${blossom.url}/upload`, { method: "PUT", body: datos, headers: { "content-type": "image/png", authorization: autorizacion("upload", sha256) } });
    expect(subida.status).toBe(200);
    const descriptor: unknown = await subida.json();
    expect(descriptor).toMatchObject({ sha256, size: datos.length, type: "image/png", url: `${blossom.url}/${sha256}` });

    const bajada = await fetch(`${blossom.url}/${sha256}.png`);
    expect(bajada.status).toBe(200);
    expect(bajada.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await bajada.arrayBuffer()).equals(datos)).toBe(true);
  });

  it("rechaza subidas sin autorización, vencidas o para otro archivo", async () => {
    const sinAuth = await fetch(`${blossom.url}/upload`, { method: "PUT", body: datos });
    expect(sinAuth.status).toBe(401);
    const vencida = await fetch(`${blossom.url}/upload`, { method: "PUT", body: datos, headers: { authorization: autorizacion("upload", sha256, -10) } });
    expect(vencida.status).toBe(401);
    const otroArchivo = await fetch(`${blossom.url}/upload`, { method: "PUT", body: datos, headers: { authorization: autorizacion("upload", "0".repeat(64)) } });
    expect(otroArchivo.status).toBe(401);
    expect(otroArchivo.headers.get("x-reason")).toMatch(/no cubre/);
  });
});
