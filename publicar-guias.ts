// Publica las guías de guias/ como artículos largos de Nostr. Son eventos
// direccionables: republicar con el mismo identificador corrige la versión que ya
// está, no la duplica.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as nip19 from "nostr-tools/nip19";
import { finalizeEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { KIND_ARTICULO_LARGO, armarGuia } from "@colmena/protocolo";

const RELAYS = (process.env.RELAYS ?? "wss://nos.lol,wss://relay.damus.io,wss://relay.primal.net").split(",").map((r) => r.trim());
const RUTA_CLAVE = process.env.RUTA_CLAVE ?? "apps/puerta/estado/clave.txt";

if (!existsSync(RUTA_CLAVE)) {
  console.error(`No encuentro la clave en ${RUTA_CLAVE}. Levantá la puerta una vez y se genera sola.`);
  process.exit(1);
}
const clave = nip19.decode(readFileSync(RUTA_CLAVE, "utf8").trim()).data as Uint8Array;

// Cada guía es un Markdown con frontmatter mínimo: título, resumen y temas.
function leerGuia(archivo: string): { identificador: string; titulo: string; resumen: string; temas: string[]; contenido: string } | null {
  const crudo = readFileSync(join("guias", archivo), "utf8");
  const bloque = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(crudo);
  if (!bloque) return null;
  const campos = new Map<string, string>();
  for (const linea of (bloque[1] ?? "").split("\n")) {
    const dosPuntos = linea.indexOf(":");
    if (dosPuntos > 0) campos.set(linea.slice(0, dosPuntos).trim(), linea.slice(dosPuntos + 1).trim());
  }
  const titulo = campos.get("titulo");
  if (!titulo) return null;
  return {
    identificador: archivo.replace(/\.md$/, ""),
    titulo,
    resumen: campos.get("resumen") ?? "",
    temas: (campos.get("temas") ?? "").split(",").map((t) => t.trim()).filter((t) => t.length > 0),
    contenido: (bloque[2] ?? "").trim(),
  };
}

const pool = new SimplePool();
for (const archivo of readdirSync("guias").filter((a) => a.endsWith(".md") && a !== "LEEME.md")) {
  const guia = leerGuia(archivo);
  if (!guia) {
    console.error(`${archivo}: le falta el frontmatter con titulo`);
    continue;
  }
  const evento = finalizeEvent(armarGuia(guia), clave);
  const resultados = await Promise.allSettled(pool.publish(RELAYS, evento).map((p) => p.catch((m: unknown) => Promise.reject(new Error(String(m))))));
  const aceptaron = resultados.filter((r) => r.status === "fulfilled").length;
  const naddr = nip19.naddrEncode({ kind: KIND_ARTICULO_LARGO, pubkey: evento.pubkey, identifier: guia.identificador, relays: RELAYS.slice(0, 2) });
  console.log(`${guia.titulo}\n  ${aceptaron}/${RELAYS.length} relays\n  https://njump.me/${naddr}\n`);
}
pool.close(RELAYS);
