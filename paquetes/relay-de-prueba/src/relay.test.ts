import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { iniciarRelayDePrueba } from "./index";
import type { RelayDePrueba } from "./index";

let relay: RelayDePrueba;
const pool = new SimplePool();
const clave = generateSecretKey();
const pubkey = getPublicKey(clave);

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
});

afterAll(async () => {
  pool.close([relay.url]);
  await relay.cerrar();
});

describe("relay de prueba", () => {
  it("acepta un evento firmado, lo devuelve en una consulta y lo empuja a suscriptores", async () => {
    const recibidos: EventoNostr[] = [];
    const sub = pool.subscribe([relay.url], { kinds: [1], "#t": ["pregunta"] }, { onevent: (e) => recibidos.push(e) });
    await new Promise((r) => setTimeout(r, 100));

    const evento = finalizeEvent({ kind: 1, content: "hola", created_at: Math.floor(Date.now() / 1000), tags: [["t", "pregunta"]] }, clave);
    await Promise.any(pool.publish([relay.url], evento));

    const consultados = await pool.querySync([relay.url], { ids: [evento.id] });
    expect(consultados.map((e) => e.id)).toEqual([evento.id]);
    await new Promise((r) => setTimeout(r, 100));
    expect(recibidos.map((e) => e.id)).toEqual([evento.id]);
    sub.close();
  });

  it("rechaza un evento con firma inválida", async () => {
    const evento = finalizeEvent({ kind: 1, content: "hola", created_at: 1, tags: [] }, clave);
    const roto = { ...evento, content: "otro contenido" };
    await expect(Promise.any(pool.publish([relay.url], roto))).rejects.toBeDefined();
  });

  it("guarda una sola versión de un evento direccionable por autor y tema", async () => {
    const vieja = finalizeEvent({ kind: 30818, content: "v1", created_at: 100, tags: [["d", "tema"]] }, clave);
    const nueva = finalizeEvent({ kind: 30818, content: "v2", created_at: 200, tags: [["d", "tema"]] }, clave);
    await Promise.any(pool.publish([relay.url], vieja));
    await Promise.any(pool.publish([relay.url], nueva));
    const versiones = await pool.querySync([relay.url], { kinds: [30818], authors: [pubkey], "#d": ["tema"] });
    expect(versiones.map((e) => e.content)).toEqual(["v2"]);
  });
});
