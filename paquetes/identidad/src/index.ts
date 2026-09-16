import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as nip19 from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

export interface Identidad {
  clavePrivada: Uint8Array;
  pubkey: string;
  npub: string;
  nsec: string;
}

export function identidadDesdeClave(clavePrivada: Uint8Array): Identidad {
  const pubkey = getPublicKey(clavePrivada);
  return { clavePrivada, pubkey, npub: nip19.npubEncode(pubkey), nsec: nip19.nsecEncode(clavePrivada) };
}

export function identidadDesdeNsec(nsec: string): Identidad {
  const decodificado = nip19.decode(nsec.trim());
  if (decodificado.type !== "nsec") throw new Error("la clave tiene que ser un nsec (NIP-19)");
  return identidadDesdeClave(decodificado.data);
}

export function generarIdentidad(): Identidad {
  return identidadDesdeClave(generateSecretKey());
}

// El agente tiene su propia clave, nunca la personal de quien lo opera: lo que el
// agente publica queda firmado por él y su reputación es suya. Si no hay clave, se
// genera una y se guarda con permisos solo para el usuario.
export function cargarOCrearIdentidad(rutaClave: string, nsecEntorno: string | undefined): Identidad {
  if (nsecEntorno && nsecEntorno.trim().length > 0) return identidadDesdeNsec(nsecEntorno);
  if (existsSync(rutaClave)) return identidadDesdeNsec(readFileSync(rutaClave, "utf8"));
  const identidad = generarIdentidad();
  mkdirSync(dirname(rutaClave), { recursive: true });
  writeFileSync(rutaClave, identidad.nsec + "\n", { mode: 0o600 });
  return identidad;
}
