import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import {
  KIND_NOTA,
  armarAceptacion,
  armarCorreccion,
  armarEntradaDeBitacora,
  armarPregunta,
  esEntradaDeBitacora,
  fuenteDe,
  leerBitacoraConsolidada,
  minarYFirmar,
  vieneDeUnError,
} from "@colmena/protocolo";
import { generarIdentidad } from "@colmena/identidad";
import { crearRed } from "@colmena/red";
import { prepararNode } from "@colmena/red/node";
import type { Red } from "@colmena/red";
import { iniciarRelayDePrueba } from "@colmena/relay-de-prueba";
import type { RelayDePrueba } from "@colmena/relay-de-prueba";
import { cerebroFalso } from "../cerebros/falso";
import { crearAgente } from "../nucleo/agente";
import type { Agente } from "../nucleo/agente";
import { billeteraFalsa } from "../nucleo/billetera";
import { Estado } from "../nucleo/estado";
import { registrarNada } from "../nucleo/registro";
import { oficioAprender } from "./aprender";
import { oficioResponder } from "./responder";

prepararNode();

let relay: RelayDePrueba;
let red: Red;
let agente: Agente;
const identidad = generarIdentidad();
const humano = generateSecretKey();
const personasVistas: string[] = [];

const politica = {
  powMinimo: 6,
  powRespuesta: 4,
  deriva: { probabilidad: 1, demoraMaxSeg: 0 },
  limites: { maxPorHora: 20, maxPorDia: 20, maxPorAutorPorDia: 20 },
  maxPreguntasPorDia: 0,
    responderSinQueMeLlamen: false,
    temasAbiertos: [],
    maxIntromisionesPorDia: 3,
};

function crear(estado: Estado): Agente {
  return crearAgente({
    identidad,
    relays: [relay.url],
    cerebro: cerebroFalso({
      respuesta: (entrada, sistema) => {
        // Se guarda la persona del sistema junto con la entrada: la bitácora va
        // en la persona, porque es del agente y no del que pregunta.
        personasVistas.push(`${sistema}\n${entrada}`);
        // El oficio aprender pide una lección en una frase; responder pide una respuesta.
        if (entrada.includes("La corrección:")) return "Cuando me pregunten por relays, decir que conviene usar varios y por qué.";
        if (entrada.includes("Lo que contestaste:")) return "NADA";
        return "Con un relay alcanza.";
      },
    }),
    billetera: billeteraFalsa(),
    estado,
    oficios: [oficioResponder(), oficioAprender({ maxAnotacionesPorDia: 10, releerCada: 3, revisarSeg: 1 })],
    politica,
    personas: { preguntas: "p", ayuda: "a", curar: "c", tareas: "t", sintetizar: "s", aprender: "persona de aprendizaje de prueba" },
    perfil: null,
    registrar: registrarNada,
    cuantoRecuerda: 10,
  });
}

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  red = crearRed([relay.url]);
  agente = crear(Estado.enMemoria());
  await agente.iniciar();
  await new Promise((r) => setTimeout(r, 200));
});

afterAll(async () => {
  await agente.detener();
  red.cerrar();
  await relay.cerrar();
});

function esperar(condicion: () => boolean, hastaMs: number): Promise<void> {
  return new Promise((resolver) => {
    const inicio = Date.now();
    const revisar = (): void => {
      if (condicion() || Date.now() - inicio > hastaMs) resolver();
      else setTimeout(revisar, 100);
    };
    revisar();
  });
}

function bitacoraDelAgente(): EventoNostr[] {
  return relay.eventos().filter((evento) => evento.pubkey === identidad.pubkey && esEntradaDeBitacora(evento));
}

describe("aprender de haberse equivocado", () => {
  it("cuando alguien lo corrige, anota la lección firmada y marcada como error", async () => {
    const pregunta = minarYFirmar(armarPregunta("¿Cuántos relays conviene usar?", { temas: ["nostr"] }), humano, 6);
    await red.publicar(pregunta);
    await esperar(() => relay.eventos().some((e) => e.pubkey === identidad.pubkey && e.content === "Con un relay alcanza."), 6000);

    const respuesta = relay.eventos().find((e) => e.pubkey === identidad.pubkey && e.content === "Con un relay alcanza.");
    expect(respuesta).toBeDefined();

    // Un humano lo corrige en público. Eso es lo que la red permite en vez de borrar.
    const correccion = minarYFirmar(armarCorreccion(respuesta!, "Con uno solo perdés todo si se cae. Usá tres.", relay.url), humano, 4);
    await red.publicar(correccion);
    await esperar(() => bitacoraDelAgente().length > 0, 8000);

    const entradas = bitacoraDelAgente();
    expect(entradas).toHaveLength(1);
    const anotacion = entradas[0]!;
    expect(anotacion.content).toBe("Cuando me pregunten por relays, decir que conviene usar varios y por qué.");
    // Queda marcada como aprendida de un error: es lo más caro de aprender.
    expect(vieneDeUnError(anotacion)).toBe(true);
    expect(fuenteDe(anotacion)).toBe(correccion.id);
    // Y es una nota común, así que cualquier cliente de Nostr la muestra.
    expect(anotacion.kind).toBe(KIND_NOTA);
  });

  it("no anota nada cuando no hay lección que guardar", async () => {
    const antes = bitacoraDelAgente().length;
    const pregunta = minarYFirmar(armarPregunta("¿Otra cosa distinta?", { temas: ["nostr"] }), humano, 6);
    await red.publicar(pregunta);
    await esperar(() => relay.eventos().some((e) => e.pubkey === identidad.pubkey && e.tags.some((t) => t[0] === "e" && t[1] === pregunta.id)), 6000);
    const respuesta = relay.eventos().find((e) => e.pubkey === identidad.pubkey && e.tags.some((t) => t[0] === "e" && t[1] === pregunta.id));
    await red.publicar(minarYFirmar(armarAceptacion(respuesta!, relay.url), humano, 4));
    await new Promise((r) => setTimeout(r, 3000));
    // El cerebro dijo NADA para la aceptación: una bitácora de obviedades es peor que una vacía.
    expect(bitacoraDelAgente()).toHaveLength(antes);
  });
});

describe("la memoria vive en la red, no en la máquina", () => {
  it("una instancia nueva, con estado en blanco, lee lo que aprendió la anterior", async () => {
    expect(bitacoraDelAgente().length).toBeGreaterThan(0);
    await agente.detener();

    // Estado nuevo y vacío: es como si la máquina se hubiera formateado.
    const otraVida = crear(Estado.enMemoria());
    personasVistas.length = 0;
    await otraVida.iniciar();
    await new Promise((r) => setTimeout(r, 400));

    const pregunta = minarYFirmar(armarPregunta("¿Y ahora qué me decís de los relays?", { temas: ["nostr"] }), humano, 6);
    await red.publicar(pregunta);
    await esperar(() => personasVistas.some((p) => p.includes("¿Y ahora qué me decís de los relays?")), 8000);

    // Lo que aprendió antes le llegó al modelo como contexto propio, sin haberlo
    // guardado en ningún archivo de esta máquina.
    const alResponder = personasVistas.find((p) => p.includes("¿Y ahora qué me decís de los relays?"));
    expect(alResponder).toContain("Cuando me pregunten por relays, decir que conviene usar varios");
    expect(alResponder).toContain("Lo que aprendiste antes, escrito por vos");
    await otraVida.detener();
    agente = otraVida;
  });
});

describe("releerse en vez de buscar", () => {
  it("con muchas anotaciones sueltas las reescribe en menos, y la huella no se borra", async () => {
    // Un agente nuevo, con su propia identidad, que ya anotó cinco cosas sueltas
    // y varias dicen lo mismo. Es la pila que la relectura tiene que limpiar.
    const suyo = generarIdentidad();
    const sueltas = [
      "Cuando me pregunten por relays, decir que conviene usar varios.",
      "Sobre relays: siempre recomendar más de uno.",
      "Me equivoqué y aprendí: con un solo relay se pierde todo si se cae.",
      "Ser amable al responder.",
      "Responder con amabilidad siempre.",
    ];
    for (const texto of sueltas) {
      await red.publicar(minarYFirmar(armarEntradaDeBitacora({ aprendizaje: texto }), suyo.clavePrivada, 2));
    }
    await new Promise((r) => setTimeout(r, 300));

    let releidasVistas = 0;
    const agenteQueRelee = crearAgente({
      identidad: suyo,
      relays: [relay.url],
      cerebro: cerebroFalso({
        respuesta: (entrada) => {
          if (!entrada.includes("Reescribilas dejando menos")) return "NADA";
          releidasVistas = (entrada.match(/\n- /g) ?? []).length;
          return "Cuando me pregunten por relays, decir que conviene usar varios: con uno solo se pierde todo si se cae.\nResponder con amabilidad.";
        },
      }),
      billetera: billeteraFalsa(),
      estado: Estado.enMemoria(),
      oficios: [oficioAprender({ maxAnotacionesPorDia: 10, releerCada: 3, revisarSeg: 0.5 })],
      politica,
      personas: { preguntas: "p", ayuda: "a", curar: "c", tareas: "t", sintetizar: "s", aprender: "persona de aprendizaje de prueba" },
      perfil: null,
      registrar: registrarNada,
      cuantoRecuerda: 20,
    });
    await agenteQueRelee.iniciar();
    await esperar(() => relay.eventos().some((e) => e.kind === 30078 && e.pubkey === suyo.pubkey), 10000);

    const consolidada = leerBitacoraConsolidada(relay.eventos().find((e) => e.kind === 30078 && e.pubkey === suyo.pubkey) ?? null);
    expect(consolidada).not.toBeNull();
    // Cinco anotaciones repetidas quedaron en dos lecciones.
    expect(releidasVistas).toBe(5);
    expect(consolidada?.lecciones).toHaveLength(2);
    expect(consolidada?.releidas).toBe(5);
    // Lo que costó equivocarse sobrevive a la relectura.
    expect(consolidada?.lecciones.join(" ")).toContain("se pierde todo si se cae");

    // Y la huella queda: las cinco sueltas siguen publicadas y firmadas.
    const huella = relay.eventos().filter((e) => e.pubkey === suyo.pubkey && esEntradaDeBitacora(e));
    expect(huella).toHaveLength(5);

    await agenteQueRelee.detener();
  });
});
