import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as nip19 from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_ARTICULO, KIND_PEDIDO_FUSION, armarAceptacion, armarArticulo, armarPregunta, armarRespuesta, armarVotoArticulo, minarYFirmar, valorDeTag } from "@colmena/protocolo";
import { generarIdentidad } from "@colmena/identidad";
import { crearRed } from "@colmena/red";
import type { Red } from "@colmena/red";
import { iniciarRelayDePrueba } from "@colmena/relay-de-prueba";
import type { RelayDePrueba } from "@colmena/relay-de-prueba";
import { cerebroFalso } from "../cerebros/falso";
import { crearAgente } from "../nucleo/agente";
import type { Agente } from "../nucleo/agente";
import { billeteraFalsa } from "../nucleo/billetera";
import { Estado } from "../nucleo/estado";
import { registrarNada } from "../nucleo/registro";
import { oficioSintetizar } from "./sintetizar";

let relay: RelayDePrueba;
let red: Red;
let agente: Agente;
const identidad = generarIdentidad();
const quienPregunta = generateSecretKey();
const quienResponde = generateSecretKey();
const otroAutor = generateSecretKey();
const entradas: string[] = [];

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  red = crearRed([relay.url]);
  agente = crearAgente({
    identidad,
    relays: [relay.url],
    cerebro: cerebroFalso({
      // El cerebro falso escribe un artículo que cita la primera respuesta del hilo.
      respuesta: (entrada) => {
        entradas.push(entrada);
        const referencia = /nostr:nevent1[0-9a-z]+/.exec(entrada.split("Respuesta aceptada")[1] ?? "")?.[0] ?? "";
        return JSON.stringify({ tema: "ignorado", titulo: "Relays de Nostr", contenido: `Un relay guarda y reparte eventos ${referencia}. Se intentó usar uno solo y no alcanzó ${referencia}.` });
      },
    }),
    billetera: billeteraFalsa(),
    estado: Estado.enMemoria(),
    oficios: [oficioSintetizar({ revisarAceptacionesSeg: 0.4, licencia: "CC-BY-SA-4.0", duenoPubkey: null, maxSintesisPorDia: 10 })],
    politica: { powMinimo: 8, powRespuesta: 2, deriva: { probabilidad: 1, demoraMaxSeg: 0 }, limites: { maxPorHora: 10, maxPorDia: 10, maxPorAutorPorDia: 10 }, maxPreguntasPorDia: 0, responderSinQueMeLlamen: false, temasAbiertos: [], maxIntromisionesPorDia: 3 },
    personas: { preguntas: "p", ayuda: "a", curar: "c", tareas: "t", sintetizar: "persona de síntesis de prueba", aprender: "a" },
    perfil: null,
    registrar: registrarNada,
  });
  await agente.iniciar();
  await new Promise((r) => setTimeout(r, 200));
});

afterAll(async () => {
  await agente.detener();
  red.cerrar();
  await relay.cerrar();
});

async function esperar(condicion: () => boolean, hastaMs: number): Promise<void> {
  const inicio = Date.now();
  while (!condicion() && Date.now() - inicio < hastaMs) await new Promise((r) => setTimeout(r, 100));
}

describe("oficio sintetizar", () => {
  it("convierte un hilo con respuesta aceptada en un artículo con procedencia, y defiere a una versión ajena con apoyo", async () => {
    // Ya existe una versión ajena del tema con un apoyo.
    const ajena = finalizeEvent(armarArticulo({ tema: "nostr", titulo: "Nostr", contenido: "Versión de otro." }), otroAutor);
    await red.publicar(ajena);
    await red.publicar(finalizeEvent(armarVotoArticulo(ajena, relay.url), quienResponde));

    const pregunta = minarYFirmar(armarPregunta("¿Qué es un relay?", { temas: ["nostr"] }), quienPregunta, 8);
    await red.publicar(pregunta);
    await new Promise((r) => setTimeout(r, 300));
    const respuesta = finalizeEvent(armarRespuesta(pregunta, "Un relay guarda y reparte eventos.", relay.url), quienResponde);
    await red.publicar(respuesta);
    await red.publicar(finalizeEvent(armarAceptacion(respuesta, relay.url), quienPregunta));

    await esperar(() => relay.eventos().some((e) => e.kind === KIND_ARTICULO && e.pubkey === identidad.pubkey), 8000);
    const articulo = relay.eventos().find((e): e is EventoNostr => e.kind === KIND_ARTICULO && e.pubkey === identidad.pubkey);
    expect(articulo).toBeDefined();
    expect(valorDeTag(articulo ?? pregunta, "d")).toBe("nostr");
    expect(valorDeTag(articulo ?? pregunta, "title")).toBe("Relays de Nostr");
    expect(valorDeTag(articulo ?? pregunta, "license")).toBe("CC-BY-SA-4.0");
    const referencia = /nostr:(nevent1[0-9a-z]+)/.exec(articulo?.content ?? "")?.[1] ?? "";
    const decodificado = nip19.decode(referencia);
    expect(decodificado.type === "nevent" && decodificado.data.id).toBe(respuesta.id);
    expect(articulo?.content).toContain("no alcanzó");
    expect(articulo?.tags).toContainEqual(["a", `30818:${getPublicKey(otroAutor)}:nostr`, relay.url, "defer"]);

    await esperar(() => relay.eventos().some((e) => e.kind === KIND_PEDIDO_FUSION), 3000);
    const fusion = relay.eventos().find((e) => e.kind === KIND_PEDIDO_FUSION);
    expect(fusion?.pubkey).toBe(identidad.pubkey);
    expect(fusion?.tags).toContainEqual(["a", `30818:${getPublicKey(otroAutor)}:nostr`]);
    expect(fusion?.tags).toContainEqual(["e", articulo?.id ?? "", "", "source"]);

    // La síntesis se hace una sola vez por pregunta.
    await new Promise((r) => setTimeout(r, 1200));
    expect(relay.eventos().filter((e) => e.kind === KIND_ARTICULO && e.pubkey === identidad.pubkey)).toHaveLength(1);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toContain("Tema sugerido: nostr");
  });
});
