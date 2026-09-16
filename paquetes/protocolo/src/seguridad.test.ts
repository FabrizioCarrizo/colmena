import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  armarCorreccion,
  armarMandato,
  armarPregunta,
  armarRechazo,
  armarRespuesta,
  correccionDe,
  direccionDeMandato,
  esDeLaColmena,
  esRechazo,
  hiloDe,
  leerMandato,
  temasDe,
  valorDeTag,
  verboDe,
} from "./index";

const clave = generateSecretKey();
const otra = generateSecretKey();

describe("corregirse en público", () => {
  it("la corrección es una respuesta normal del hilo que además dice qué corrige", () => {
    const pregunta = finalizeEvent(armarPregunta("¿Cuántos relays conviene usar?"), clave);
    const respuesta = finalizeEvent(armarRespuesta(pregunta, "Con uno alcanza.", "wss://r"), otra);
    const correccion = armarCorreccion(respuesta, "Me equivoqué: con uno solo perdés todo si se cae. Usá tres.", "wss://r");

    // Para cualquier cliente de Nostr es una respuesta más y se ve en el hilo;
    // el tag extra es lo que deja decir que enmienda algo.
    expect(correccion.kind).toBe(1);
    expect(hiloDe(correccion).raiz?.id).toBe(pregunta.id);
    expect(hiloDe(correccion).padre?.id).toBe(respuesta.id);
    expect(correccionDe(finalizeEvent(correccion, otra))).toBe(respuesta.id);
    expect(correccionDe(respuesta)).toBeNull();
  });
});

describe("decir que no", () => {
  it("el rechazo queda como respuesta con motivo, no como falla silenciosa", () => {
    const pregunta = finalizeEvent(armarPregunta("Escribime un correo para engañar a alguien."), clave);
    const rechazo = finalizeEvent(armarRechazo(pregunta, "No voy a escribir eso: sirve para estafar a una persona.", "wss://r"), otra);

    expect(esRechazo(rechazo)).toBe(true);
    expect(rechazo.content).toContain("No voy a escribir eso");
    expect(hiloDe(rechazo).raiz?.id).toBe(pregunta.id);
    expect(esRechazo(pregunta)).toBe(false);
  });
});

describe("mandato público del agente", () => {
  it("lo firma el dueño, nombra al agente y se puede leer", () => {
    const dueno = clave;
    const agente = getPublicKey(otra);
    const mandato = armarMandato(agente, {
      oficios: ["responder", "curar"],
      topeDiarioSats: 500,
      modelo: "qwen3:8b",
      nota: "Responde preguntas y cura contenido. No toma trabajo pago ni paga nada.",
    });
    const firmado = finalizeEvent(mandato, dueno);

    expect(firmado.kind).toBe(30078);
    expect(valorDeTag(firmado, "d")).toBe(`colmena:mandato:${agente}`);
    expect(valorDeTag(firmado, "p")).toBe(agente);
    // Lo firma el dueño, no el agente: por eso sirve para verificarlo.
    expect(firmado.pubkey).toBe(getPublicKey(dueno));
    expect(direccionDeMandato(getPublicKey(dueno), agente)).toBe(`30078:${getPublicKey(dueno)}:colmena:mandato:${agente}`);

    const leido = leerMandato(firmado);
    expect(leido).toMatchObject({ oficios: ["responder", "curar"], topeDiarioSats: 500, modelo: "qwen3:8b" });
    expect(leerMandato({ content: "no es json" })).toBeNull();
    expect(leerMandato(null)).toBeNull();
  });
});

describe("no le contestamos a quien no nos llamó", () => {
  it("un pedido de la colmena lleva la etiqueta de la red, y una nota ajena no", () => {
    const pregunta = finalizeEvent(armarPregunta("¿Cómo va?", { temas: ["nostr"] }), clave);
    expect(esDeLaColmena(pregunta)).toBe(true);
    // La etiqueta de la red no es un tema: no debería aparecer como si lo fuera.
    expect(temasDe(pregunta)).toEqual(["nostr"]);

    // Alguien en Nostr que usa la palabra "pregunta" como etiqueta, sin saber que
    // existimos. Tiene verbo pero no nos llamó: mirarlo sí, contestarle no.
    const ajena = finalizeEvent({ kind: 1, content: "¿Alguien sabe de esto?", created_at: 1, tags: [["t", "pregunta"]] }, clave);
    expect(verboDe(ajena)).toBe("pregunta");
    expect(esDeLaColmena(ajena)).toBe(false);
  });
});
