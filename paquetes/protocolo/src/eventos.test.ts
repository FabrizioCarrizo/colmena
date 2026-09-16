import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  armarAceptacion,
  armarArticulo,
  armarEntrega,
  armarPerfilDeAgente,
  armarPregunta,
  armarRespuesta,
  armarTarea,
  armarVoto,
  hiloDe,
  leerPerfil,
  normalizarTema,
  temasDe,
  textoDe,
  valorDeTag,
  verboDe,
} from "./index";

const clave = generateSecretKey();
const pubkey = getPublicKey(clave);

describe("pregunta", () => {
  it("lleva el verbo primero, los temas normalizados y vencimiento", () => {
    const pregunta = armarPregunta("¿Qué es Nostr?", { temas: ["Redes Descentralizadas", "nostr"] });
    expect(pregunta.kind).toBe(1);
    expect(pregunta.tags[0]).toEqual(["t", "pregunta"]);
    expect(temasDe(pregunta)).toEqual(["redes-descentralizadas", "nostr"]);
    expect(Number(valorDeTag(pregunta, "expiration"))).toBeGreaterThan(pregunta.created_at);
    expect(pregunta.tags.some((t) => t[0] === "nonce")).toBe(false);
  });

  it("se reconoce como pedido con verbo y texto", () => {
    const evento = finalizeEvent(armarPregunta("hola"), clave);
    expect(verboDe(evento)).toBe("pregunta");
    expect(textoDe(evento)).toBe("hola");
  });

  it("una nota común sin verbo no es un pedido", () => {
    const evento = finalizeEvent({ kind: 1, content: "hola", created_at: 1, tags: [["t", "nostr"]] }, clave);
    expect(verboDe(evento)).toBeNull();
  });
});

describe("respuesta", () => {
  it("a una raíz lleva marcador root y cita al autor", () => {
    const pregunta = finalizeEvent(armarPregunta("hola"), clave);
    const respuesta = armarRespuesta(pregunta, "buenas", "wss://relay.local");
    expect(respuesta.tags).toContainEqual(["e", pregunta.id, "wss://relay.local", "root", pubkey]);
    expect(respuesta.tags).toContainEqual(["p", pubkey]);
    expect(hiloDe(respuesta).raiz?.id).toBe(pregunta.id);
  });

  it("a una respuesta conserva la raíz y marca reply", () => {
    const otraClave = generateSecretKey();
    const pregunta = finalizeEvent(armarPregunta("hola"), clave);
    const primera = finalizeEvent(armarRespuesta(pregunta, "buenas"), otraClave);
    const segunda = armarRespuesta(primera, "de nada");
    const hilo = hiloDe(segunda);
    expect(hilo.raiz?.id).toBe(pregunta.id);
    expect(hilo.padre?.id).toBe(primera.id);
    const citados = segunda.tags.filter((t) => t[0] === "p").map((t) => t[1]);
    expect(citados).toContain(pubkey);
    expect(citados).toContain(getPublicKey(otraClave));
  });
});

describe("reacciones", () => {
  it("el voto y la aceptación referencian el evento y su autor", () => {
    const pregunta = finalizeEvent(armarPregunta("hola"), clave);
    const voto = armarVoto(pregunta, true, "wss://r");
    expect(voto.kind).toBe(7);
    expect(voto.content).toBe("+");
    expect(voto.tags).toContainEqual(["e", pregunta.id, "wss://r", pubkey]);
    expect(voto.tags).toContainEqual(["k", "1"]);
    expect(armarAceptacion(pregunta).content).toBe("✅");
    expect(armarVoto(pregunta, false).content).toBe("-");
  });
});

describe("tarea", () => {
  it("es un pedido NIP-90 con consigna, presupuesto y relays", () => {
    const tarea = armarTarea("traducí esto", { presupuestoMsats: 21000, relays: ["wss://a", "wss://b"], temas: ["traducción"] });
    expect(tarea.kind).toBe(5050);
    expect(tarea.tags).toContainEqual(["i", "traducí esto", "text"]);
    expect(tarea.tags).toContainEqual(["bid", "21000"]);
    expect(tarea.tags).toContainEqual(["relays", "wss://a", "wss://b"]);
    const firmada = finalizeEvent(tarea, clave);
    expect(verboDe(firmada)).toBe("tarea");
    expect(textoDe(firmada)).toBe("traducí esto");
    const entrega = armarEntrega(firmada, "listo", { montoMsats: 21000, bolt11: "lnbc1..." });
    expect(entrega.kind).toBe(6050);
    expect(entrega.tags).toContainEqual(["p", pubkey]);
    expect(entrega.tags).toContainEqual(["amount", "21000", "lnbc1..."]);
    expect(entrega.tags.some((t) => t[0] === "request")).toBe(true);
  });
});

describe("artículo y perfil", () => {
  it("normaliza el tema según NIP-54 conservando letras no ASCII", () => {
    expect(normalizarTema("  Arte Indígena del Caribe! ")).toBe("arte-indígena-del-caribe");
    expect(normalizarTema("Nepuyo (Trinidad) 2026")).toBe("nepuyo-trinidad-2026");
    expect(normalizarTema("日本語 の テーマ")).toBe("日本語-の-テーマ");
    expect(armarArticulo({ tema: "Arte Indígena", titulo: "Arte Indígena", contenido: "..." }).tags[0]).toEqual(["d", "arte-indígena"]);
  });

  it("el perfil de agente se declara y se lee", () => {
    const perfil = finalizeEvent(armarPerfilDeAgente({ nombre: "Obrera", descripcion: "prueba", modelo: "claude-opus-5", operador: "fabrizio" }), clave);
    const leido = leerPerfil(perfil);
    expect(leido.esAgente).toBe(true);
    expect(leido.nombre).toBe("Obrera");
    expect(leido.modelo).toBe("claude-opus-5");
    expect(leerPerfil({ content: "esto no es json" }).esAgente).toBe(false);
    expect(leerPerfil(null).nombre).toBeNull();
  });
});
