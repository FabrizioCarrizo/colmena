import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_ENTREGA, KIND_FEEDBACK, armarTarea, minarYFirmar, valorDeTag } from "@colmena/protocolo";
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
import { oficioTomarTareas } from "./tomar-tareas";

let relay: RelayDePrueba;
let red: Red;
let agente: Agente;
const identidad = generarIdentidad();
const cliente = generateSecretKey();
const billetera = billeteraFalsa();
const estado = Estado.enMemoria();

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  red = crearRed([relay.url]);
  agente = crearAgente({
    identidad,
    relays: [relay.url],
    cerebro: cerebroFalso({ respuesta: () => "hello" }),
    billetera,
    estado,
    oficios: [oficioTomarTareas({ precioMinimoMsats: 1000, revisarCobrosSeg: 0.3 })],
    politica: { powMinimo: 8, powRespuesta: 2, deriva: { probabilidad: 1, demoraMaxSeg: 0 }, limites: { maxPorHora: 10, maxPorDia: 10, maxPorAutorPorDia: 10 }, maxPreguntasPorDia: 0 },
    personas: { preguntas: "p", ayuda: "a", curar: "c", tareas: "persona de tareas de prueba", sintetizar: "s", aprender: "a" },
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

function esperarEventos(idTarea: string, cantidad: number, hastaMs: number): Promise<EventoNostr[]> {
  return new Promise((resolver) => {
    const vistos = new Map<string, EventoNostr>();
    const sub = red.suscribir({ kinds: [KIND_ENTREGA, KIND_FEEDBACK], "#e": [idTarea] }, (evento) => {
      vistos.set(evento.id, evento);
      if (vistos.size >= cantidad) terminar();
    });
    const temporizador = setTimeout(terminar, hastaMs);
    function terminar(): void {
      clearTimeout(temporizador);
      sub.cerrar();
      resolver([...vistos.values()].sort((a, b) => a.kind - b.kind));
    }
  });
}

describe("oficio tomar-tareas", () => {
  it("avisa que la procesa, entrega con factura, y marca el cobro cuando la factura se paga", async () => {
    const tarea = minarYFirmar(armarTarea("Traducí 'hola' al inglés.", { presupuestoMsats: 21000, relays: [relay.url], temas: ["traducción"] }), cliente, 8);
    const esperando = esperarEventos(tarea.id, 2, 8000);
    await red.publicar(tarea);
    const eventos = await esperando;

    const entrega = eventos.find((e) => e.kind === KIND_ENTREGA);
    const feedback = eventos.find((e) => e.kind === KIND_FEEDBACK);
    expect(feedback?.tags).toContainEqual(["status", "processing", ""]);
    expect(entrega?.pubkey).toBe(identidad.pubkey);
    expect(entrega?.content).toBe("hello");
    expect(entrega?.tags).toContainEqual(["p", tarea.pubkey]);
    const monto = entrega?.tags.find((t) => t[0] === "amount");
    expect(monto?.[1]).toBe("21000");
    expect(monto?.[2]).toMatch(/^lnbc-falsa-21000/);
    expect(JSON.parse(valorDeTag(entrega ?? tarea, "request") ?? "{}")).toMatchObject({ id: tarea.id });

    const cobro = estado.cobroDe(tarea.id);
    expect(cobro).toMatchObject({ msats: 21000, pagada: false, entrega: entrega?.id });
    billetera.marcarPagada(cobro?.hash ?? "");
    await new Promise((r) => setTimeout(r, 900));
    expect(estado.cobroDe(tarea.id)?.pagada).toBe(true);
  });

  it("deja pasar una tarea con presupuesto por debajo del mínimo", async () => {
    const tarea = minarYFirmar(armarTarea("Traducí 'chau'.", { presupuestoMsats: 500, relays: [relay.url] }), cliente, 8);
    const esperando = esperarEventos(tarea.id, 1, 1500);
    await red.publicar(tarea);
    expect(await esperando).toHaveLength(0);
    expect(estado.cobroDe(tarea.id)).toBeNull();
  });
});
