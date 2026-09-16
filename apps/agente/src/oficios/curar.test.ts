import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as nip59 from "nostr-tools/nip59";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { KIND_NOTA, armarPublicacion, hiloDe, valorDeTag } from "@colmena/protocolo";
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
import { oficioCurar } from "./curar";

let relay: RelayDePrueba;
let red: Red;
let agente: Agente;
const identidadAgente = generarIdentidad();
const dueno = generarIdentidad();
const artista = generateSecretKey();
const KIND_ENVOLTORIO = 1059;

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  red = crearRed([relay.url]);
  agente = crearAgente({
    identidad: identidadAgente,
    relays: [relay.url],
    cerebro: cerebroFalso({
      veredicto: (entrada, imagenUrl) =>
        entrada.includes("Nepuyo") && imagenUrl !== undefined
          ? { coincide: true, motivo: "Es una pintura sobre un pueblo originario del Caribe.", confianza: 0.9 }
          : { coincide: false, motivo: "No tiene que ver con los intereses.", confianza: 0.8 },
    }),
    billetera: billeteraFalsa(),
    estado: Estado.enMemoria(),
    oficios: [oficioCurar({ duenoPubkey: dueno.pubkey, temasCurados: [], palabrasClave: [], umbralConfianza: 0.6, maxClasificacionesPorDia: 100, preguntarAlAutor: true })],
    politica: { powMinimo: 4, powRespuesta: 2, deriva: { probabilidad: 1, demoraMaxSeg: 0 }, limites: { maxPorHora: 10, maxPorDia: 10, maxPorAutorPorDia: 10 }, maxPreguntasPorDia: 5 },
    personas: { preguntas: "p", ayuda: "a", curar: "persona de curaduría de prueba", tareas: "persona de tareas de prueba", sintetizar: "s" },
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

function esperarEventos(filtro: Parameters<Red["suscribir"]>[0], cantidad: number, hastaMs: number): Promise<EventoNostr[]> {
  return new Promise((resolver) => {
    const vistos = new Map<string, EventoNostr>();
    const sub = red.suscribir(filtro, (evento) => {
      vistos.set(evento.id, evento);
      if (vistos.size >= cantidad) terminar();
    });
    const temporizador = setTimeout(terminar, hastaMs);
    function terminar(): void {
      clearTimeout(temporizador);
      sub.cerrar();
      resolver([...vistos.values()]);
    }
  });
}

describe("oficio curar", () => {
  it("avisa al dueño por mensaje privado solo cuando la publicación coincide, y le pregunta al autor", async () => {
    const esperandoAvisos = esperarEventos({ kinds: [KIND_ENVOLTORIO], "#p": [dueno.pubkey] }, 1, 6000);
    const esperandoPreguntas = esperarEventos({ kinds: [KIND_NOTA], "#t": ["pregunta"] }, 1, 6000);

    const gato = finalizeEvent(armarPublicacion({ url: "http://blossom.local/gato.jpg", mime: "image/jpeg", sha256: "a".repeat(64), titulo: "Mi gato durmiendo", descripcion: "Foto de mi gato." }), artista);
    const pintura = finalizeEvent(
      armarPublicacion({
        url: "http://blossom.local/nepuyo.jpg",
        mime: "image/jpeg",
        sha256: "b".repeat(64),
        titulo: "Pintura en conmemoración a los Nepuyo",
        descripcion: "Óleo sobre lienzo pintado en Arima, Trinidad.",
        temas: ["arte", "Trinidad y Tobago"],
        lugar: "Arima, Trinidad y Tobago",
      }),
      artista,
    );
    await red.publicar(gato);
    await red.publicar(pintura);

    const avisos = await esperandoAvisos;
    expect(avisos).toHaveLength(1);
    const rumor = nip59.unwrapEvent(avisos[0] ?? gato, dueno.clavePrivada);
    expect(rumor.pubkey).toBe(identidadAgente.pubkey);
    expect(rumor.content).toContain("Hallazgo: Pintura en conmemoración a los Nepuyo");
    expect(rumor.content).toContain("pueblo originario del Caribe");
    expect(rumor.content).toMatch(/nostr:nevent1/);

    const preguntas = await esperandoPreguntas;
    expect(preguntas).toHaveLength(1);
    const pregunta = preguntas[0];
    expect(pregunta?.pubkey).toBe(identidadAgente.pubkey);
    expect(pregunta?.tags).toContainEqual(["p", pintura.pubkey]);
    expect(pregunta?.tags.some((t) => t[0] === "q" && t[1] === pintura.id)).toBe(true);
    expect(valorDeTag(pregunta ?? gato, "t")).toBe("pregunta");
    expect(hiloDe(pregunta ?? gato).raiz).toBeNull();
  });
});
