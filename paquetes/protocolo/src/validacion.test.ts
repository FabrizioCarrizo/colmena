import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { EventTemplate, VerifiedEvent } from "nostr-tools/pure";
import { armarPregunta, compromisoDe, minarYFirmar, powDe, validarPedido } from "./index";

const clave = generateSecretKey();

// Firma variantes hasta dar con una cuyo id NO alcance la dificultad pedida, para que
// el test de "pow insuficiente" sea determinista y no dependa del azar del hash.
function firmarConPowMenorA(plantilla: EventTemplate, bits: number): VerifiedEvent {
  for (let intento = 0; intento < 10_000; intento++) {
    const evento = finalizeEvent({ ...plantilla, tags: [...plantilla.tags, ["nonce", String(intento), String(bits)]] }, clave);
    if (powDe(evento) < bits) return evento;
  }
  throw new Error("no se encontró un evento con pow menor");
}

describe("validarPedido", () => {
  it("acepta una pregunta minada a la dificultad exigida", () => {
    const evento = minarYFirmar(armarPregunta("¿Cuál es la capital de Trinidad y Tobago?"), clave, 8);
    expect(powDe(evento)).toBeGreaterThanOrEqual(8);
    expect(compromisoDe(evento)).toBe(8);
    const resultado = validarPedido(evento, 8);
    expect(resultado).toEqual({ valido: true, verbo: "pregunta", texto: "¿Cuál es la capital de Trinidad y Tobago?" });
  });

  it("rechaza sin nonce, con compromiso menor y con pow insuficiente", () => {
    const sinNonce = finalizeEvent(armarPregunta("hola"), clave);
    expect(validarPedido(sinNonce, 8)).toEqual({ valido: false, motivo: "sin-nonce" });

    const compromisoBajo = minarYFirmar(armarPregunta("hola"), clave, 4);
    expect(validarPedido(compromisoBajo, 8)).toEqual({ valido: false, motivo: "compromiso-menor" });

    const mentiroso = firmarConPowMenorA(armarPregunta("hola"), 8);
    expect(validarPedido(mentiroso, 8)).toEqual({ valido: false, motivo: "pow-insuficiente" });
  });

  it("rechaza vencidos, vacíos, larguísimos y sin verbo", () => {
    const vencido = finalizeEvent(armarPregunta("hola", { vidaSeg: 1 }), clave);
    expect(validarPedido(vencido, 0, vencido.created_at + 5)).toEqual({ valido: false, motivo: "vencido" });
    expect(validarPedido(finalizeEvent(armarPregunta("   "), clave), 0)).toEqual({ valido: false, motivo: "vacio" });
    expect(validarPedido(finalizeEvent(armarPregunta("x".repeat(4001)), clave), 0)).toEqual({ valido: false, motivo: "muy-largo" });
    const nota = finalizeEvent({ kind: 1, content: "hola", created_at: 1, tags: [] }, clave);
    expect(validarPedido(nota, 0)).toEqual({ valido: false, motivo: "sin-verbo" });
  });

  it("con powMinimo 0 no exige nonce", () => {
    const evento = finalizeEvent(armarPregunta("hola"), clave);
    expect(validarPedido(evento, 0).valido).toBe(true);
  });
});
