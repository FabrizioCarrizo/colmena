import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { armarPregunta, armarPedidoDeAyuda, armarRespuesta, hiloDe, minarYFirmar, powDe } from "@colmena/protocolo";
import { crearRed } from "@colmena/red";
import type { Red } from "@colmena/red";
import { iniciarRelayDePrueba } from "@colmena/relay-de-prueba";
import type { RelayDePrueba } from "@colmena/relay-de-prueba";
import { cerebroFalso } from "./cerebros/falso";
import { crearAgente } from "./nucleo/agente";
import type { Agente } from "./nucleo/agente";
import { billeteraFalsa } from "./nucleo/billetera";
import { Estado } from "./nucleo/estado";
import { generarIdentidad } from "@colmena/identidad";
import { registrarNada } from "./nucleo/registro";
import { oficioResponder } from "./oficios/responder";

let relay: RelayDePrueba;
let agente: Agente;
let red: Red;
const identidad = generarIdentidad();
const humano = generateSecretKey();
const entradasVistas: string[] = [];

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  red = crearRed([relay.url]);
  agente = crearAgente({
    identidad,
    relays: [relay.url],
    cerebro: cerebroFalso({
      respuesta: (entrada) => {
        entradasVistas.push(entrada);
        return "Hola desde el agente de prueba.";
      },
    }),
    billetera: billeteraFalsa(),
    estado: Estado.enMemoria(),
    oficios: [oficioResponder()],
    politica: {
      powMinimo: 8,
      powRespuesta: 4,
      deriva: { probabilidad: 1, demoraMaxSeg: 0 },
      limites: { maxPorHora: 10, maxPorDia: 10, maxPorAutorPorDia: 10 },
      maxPreguntasPorDia: 1,
    },
    personas: { preguntas: "persona de prueba para preguntas", ayuda: "persona de prueba para ayuda", curar: "persona de prueba para curar", tareas: "persona de prueba para tareas", sintetizar: "persona de prueba para sintetizar" },
    perfil: { nombre: "Agente de prueba", descripcion: "test", modelo: "falso", operador: "vitest" },
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

describe("agente con el oficio responder", () => {
  it("publica su perfil como agente al arrancar", async () => {
    const perfil = await red.perfilDe(identidad.pubkey);
    expect(perfil).not.toBeNull();
    expect(JSON.parse(perfil?.content ?? "{}")).toMatchObject({ name: "Agente de prueba", bot: true, modelo: "falso" });
  });

  it("responde a una pregunta válida en el hilo, con prueba de trabajo, y le pasa el texto como datos", async () => {
    const pregunta = minarYFirmar(armarPregunta("¿Qué es Nostr?", { temas: ["nostr"] }), humano, 8);
    const esperando = red.esperarRespuestas(pregunta.id, 8, { minimo: 1 });
    await red.publicar(pregunta);
    const respuestas = await esperando;

    expect(respuestas).toHaveLength(1);
    const respuesta = respuestas[0];
    expect(respuesta?.pubkey).toBe(identidad.pubkey);
    expect(respuesta?.content).toBe("Hola desde el agente de prueba.");
    expect(hiloDe(respuesta ?? { tags: [] }).raiz?.id).toBe(pregunta.id);
    expect(respuesta?.tags).toContainEqual(["p", getPublicKey(humano)]);
    expect(powDe(respuesta ?? { id: "f".repeat(64) })).toBeGreaterThanOrEqual(4);
    expect(entradasVistas.at(-1)).toContain("<<<\n¿Qué es Nostr?\n>>>");
  });

  it("ignora una pregunta sin prueba de trabajo", async () => {
    const sinPow = finalizeEvent(armarPregunta("¿Y esta sin minar?"), humano);
    const esperando = red.esperarRespuestas(sinPow.id, 1.5);
    await red.publicar(sinPow);
    expect(await esperando).toHaveLength(0);
  });

  it("no responde dos veces en el mismo hilo", async () => {
    const pregunta = minarYFirmar(armarPedidoDeAyuda("Me trabé con un test asincrónico."), humano, 8);
    const primera = red.esperarRespuestas(pregunta.id, 8, { minimo: 1 });
    await red.publicar(pregunta);
    expect(await primera).toHaveLength(1);

    const repregunta = minarYFirmar({ ...armarRespuesta(pregunta, "¿Y si te lo pregunto de nuevo?"), tags: [["t", "ayuda-ia"], ...armarRespuesta(pregunta, "").tags] }, humano, 8);
    const segunda = red.esperarRespuestas(repregunta.id, 1.5);
    await red.publicar(repregunta);
    expect(await segunda).toHaveLength(0);
  });
});
