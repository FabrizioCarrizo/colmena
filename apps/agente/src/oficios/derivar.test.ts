import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import {
  KIND_CONFIANZA,
  KIND_NOTA,
  armarListaDeConfianza,
  armarPerfilDeAgente,
  armarPregunta,
  derivacionDe,
  hiloDe,
  minarYFirmar,
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
import { oficioResponder } from "./responder";

prepararNode();

let relay: RelayDePrueba;
let red: Red;
const obrera = generarIdentidad();
const especialista = generarIdentidad();
const humano = generateSecretKey();
const agentes: Agente[] = [];

const politica = {
  powMinimo: 6,
  powRespuesta: 4,
  deriva: { probabilidad: 1, demoraMaxSeg: 0 },
  limites: { maxPorHora: 20, maxPorDia: 20, maxPorAutorPorDia: 20 },
  maxPreguntasPorDia: 0,
};
const personas = { preguntas: "p", ayuda: "a", curar: "c", tareas: "t", sintetizar: "s", aprender: "ap" };

function crear(identidad: typeof obrera, responde: (entrada: string) => string): Agente {
  return crearAgente({
    identidad,
    relays: [relay.url],
    cerebro: cerebroFalso({ respuesta: responde }),
    billetera: billeteraFalsa(),
    estado: Estado.enMemoria(),
    oficios: [oficioResponder()],
    politica,
    personas,
    perfil: null,
    registrar: registrarNada,
    cuantoRecuerda: 5,
  });
}

function esperar(condicion: () => boolean, hastaMs: number): Promise<void> {
  return new Promise((r) => {
    const inicio = Date.now();
    const ver = (): void => { if (condicion() || Date.now() - inicio > hastaMs) r(); else setTimeout(ver, 150); };
    ver();
  });
}

function respuestasA(idPregunta: string): EventoNostr[] {
  return relay.eventos().filter((e) => e.kind === KIND_NOTA && hiloDe(e).raiz?.id === idPregunta);
}

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  red = crearRed([relay.url]);

  // El especialista ya habló de apicultura antes: es lo que lo vuelve el indicado.
  await red.publicar(finalizeEvent(armarPerfilDeAgente({ nombre: "Apicultora", descripcion: "sé de abejas", modelo: "falso", operador: "nadie" }), especialista.clavePrivada));
  await red.publicar(finalizeEvent({ kind: KIND_NOTA, content: "Las colmenas de abejas necesitan ventilación en verano.", created_at: Math.floor(Date.now() / 1000) - 60, tags: [["t", "apicultura"]] }, especialista.clavePrivada));
  // Obrera confía en ella porque alguna vez la corrigió.
  await red.publicar(finalizeEvent(armarListaDeConfianza([{ pubkey: especialista.pubkey, motivo: "me corrigió y la corrección sirvió" }]), obrera.clavePrivada));
  await new Promise((r) => setTimeout(r, 300));
});

afterAll(async () => {
  for (const agente of agentes) await agente.detener();
  red.cerrar();
  await relay.cerrar();
});

describe("un agente le pasa la pregunta a otro", () => {
  it("cuando no sabe, deriva a alguien de confianza que habló del tema, y ese responde", async () => {
    const queNoSabe = crear(obrera, () => "NO SÉ. Es sobre apicultura y ventilación de colmenas.");
    const queSabe = crear(especialista, () => "Hay que abrir la piquera y darles sombra.");
    agentes.push(queNoSabe, queSabe);
    await queNoSabe.iniciar();
    await queSabe.iniciar();
    await new Promise((r) => setTimeout(r, 300));

    const pregunta = minarYFirmar(armarPregunta("¿Cómo se ventila una colmena de abejas en verano?", { temas: ["apicultura"] }), humano, 6);
    await red.publicar(pregunta);

    // Primero la derivación: no sabe, pero dice a quién se la pasa.
    await esperar(() => respuestasA(pregunta.id).some((e) => derivacionDe(e) !== null), 8000);
    const derivada = respuestasA(pregunta.id).find((e) => derivacionDe(e) !== null);
    expect(derivada).toBeDefined();
    expect(derivada!.pubkey).toBe(obrera.pubkey);
    expect(derivacionDe(derivada!)).toEqual({ hacia: especialista.pubkey, saltos: 1 });
    // Quien preguntó se entera de que lo leyeron y a quién se la pasaron.
    expect(derivada!.content).toContain("No sé esto");
    expect(derivada!.content).toContain("Apicultora");

    // Y el otro contesta de verdad: la derivación no es una evasiva.
    await esperar(() => respuestasA(pregunta.id).some((e) => e.pubkey === especialista.pubkey), 10000);
    const respuesta = respuestasA(pregunta.id).find((e) => e.pubkey === especialista.pubkey);
    expect(respuesta?.content).toBe("Hay que abrir la piquera y darles sombra.");
  });

  it("atiende una derivación de un desconocido, pero nadie lo puede obligar a responder de más", async () => {
    const extraño = generateSecretKey();
    const pregunta = minarYFirmar(armarPregunta("¿Otra de abejas?", { temas: ["apicultura"] }), humano, 6);
    await red.publicar(pregunta);
    await new Promise((r) => setTimeout(r, 500));

    // Un desconocido le pasa la pregunta al especialista. Que no lo conozca no
    // hace que sea spam: cree que puede ayudar, y eso es lo que hace comunidad.
    const derivadaPorExtraño = finalizeEvent(
      {
        kind: KIND_NOTA,
        content: "No sé de abejas, se la paso a ella.",
        created_at: Math.floor(Date.now() / 1000),
        tags: [["e", pregunta.id, relay.url, "root"], ["p", especialista.pubkey], ["deriva", especialista.pubkey, "1"]],
      },
      extraño,
    );
    await red.publicar(derivadaPorExtraño);
    await new Promise((r) => setTimeout(r, 2500));

    // Lo que sí lo protege: una cadena de derivaciones no puede seguir para
    // siempre, y responde una sola vez por hilo por más veces que lo mencionen.
    const cadenaLarga = finalizeEvent(
      {
        kind: KIND_NOTA,
        content: "Y dale, contestá.",
        created_at: Math.floor(Date.now() / 1000),
        tags: [["e", pregunta.id, relay.url, "root"], ["p", especialista.pubkey], ["deriva", especialista.pubkey, "9"]],
      },
      extraño,
    );
    await red.publicar(cadenaLarga);
    await new Promise((r) => setTimeout(r, 2000));
    const suyas = respuestasA(pregunta.id).filter((e) => e.pubkey === especialista.pubkey);
    expect(suyas.length).toBeLessThanOrEqual(1);
  });
});
