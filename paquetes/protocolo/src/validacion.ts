import type { Event as EventoNostr } from "nostr-tools/pure";
import { LARGO_MAX_PEDIDO } from "./constantes";
import type { Verbo } from "./constantes";
import { ahora } from "./eventos";
import { compromisoDe, powDe } from "./pow";
import { textoDe, vencimientoDe, verboDe } from "./tags";

export type MotivoRechazo = "sin-verbo" | "vacio" | "muy-largo" | "vencido" | "sin-nonce" | "compromiso-menor" | "pow-insuficiente";

export type ResultadoValidacion = { valido: true; verbo: Verbo; texto: string } | { valido: false; motivo: MotivoRechazo };

function rechazo(motivo: MotivoRechazo): ResultadoValidacion {
  return { valido: false, motivo };
}

// El orden importa: primero lo barato (tags), después lo que exige calcular. La prueba
// de trabajo se verifica al final y solo si el resto está en regla.
export function validarPedido(evento: EventoNostr, powMinimo: number, ahoraSeg = ahora()): ResultadoValidacion {
  const verbo = verboDe(evento);
  if (!verbo) return rechazo("sin-verbo");
  const texto = textoDe(evento);
  if (texto === null || texto.trim().length === 0) return rechazo("vacio");
  if (texto.length > LARGO_MAX_PEDIDO) return rechazo("muy-largo");
  const vence = vencimientoDe(evento);
  if (vence !== null && vence <= ahoraSeg) return rechazo("vencido");
  if (powMinimo > 0) {
    const compromiso = compromisoDe(evento);
    if (compromiso === null) return rechazo("sin-nonce");
    if (compromiso < powMinimo) return rechazo("compromiso-menor");
    if (powDe(evento) < powMinimo) return rechazo("pow-insuficiente");
  }
  return { valido: true, verbo, texto };
}
