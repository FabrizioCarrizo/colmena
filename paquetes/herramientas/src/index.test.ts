import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { armarArticulo, armarPerfilDeAgente, armarVotoArticulo, minarYFirmar, powDe, verboDe } from "@botella/protocolo";
import { generarIdentidad } from "@botella/identidad";
import { crearRed } from "@botella/red";
import type { Red } from "@botella/red";
import { iniciarRelayDePrueba } from "@botella/relay-de-prueba";
import type { RelayDePrueba } from "@botella/relay-de-prueba";
import { crearHerramientas } from "./index";
import type { Herramientas } from "./index";

let relay: RelayDePrueba;
let redA: Red;
let redB: Red;
let quienPide: Herramientas;
let quienAyuda: Herramientas;
const identidadA = generarIdentidad();
const identidadB = generarIdentidad();

beforeAll(async () => {
  relay = await iniciarRelayDePrueba();
  redA = crearRed([relay.url]);
  redB = crearRed([relay.url]);
  quienPide = crearHerramientas({ red: redA, identidad: identidadA, powPedido: 8, powRespuesta: 4 });
  quienAyuda = crearHerramientas({ red: redB, identidad: identidadB, powPedido: 8, powRespuesta: 4 });
  const perfil = minarYFirmar(armarPerfilDeAgente({ nombre: "Ayudante", descripcion: "test", modelo: "falso", operador: "vitest" }), identidadB.clavePrivada, 0);
  await redB.publicar(perfil);
});

afterAll(async () => {
  redA.cerrar();
  redB.cerrar();
  await relay.cerrar();
});

describe("herramientas de la red", () => {
  it("un agente lanza un pedido de ayuda, otro lo encuentra y lo responde, y la respuesta vuelve", async () => {
    const pedido = await quienPide.lanzarPedido({ texto: "Me trabé con un test asincrónico en vitest.", verbo: "ayuda-ia", temas: ["vitest", "TypeScript"] });
    expect(pedido.nevent.startsWith("nevent1")).toBe(true);
    expect(pedido.relays).toEqual([relay.url]);
    const [publicado] = relay.eventos().filter((e) => e.id === pedido.id);
    expect(publicado && verboDe(publicado)).toBe("ayuda-ia");
    expect(publicado && powDe(publicado)).toBeGreaterThanOrEqual(8);

    const encontrados = await quienAyuda.buscarPedidos({ verbo: "ayuda-ia", tema: "typescript", limite: 5 });
    expect(encontrados.map((p) => p.id)).toEqual([pedido.id]);
    expect(encontrados[0]?.temas).toEqual(["vitest", "typescript"]);
    expect(await quienAyuda.buscarPedidos({ verbo: "ayuda-ia", tema: "cocina", limite: 5 })).toEqual([]);
    expect(await quienAyuda.buscarPedidos({ verbo: "pregunta", tema: null, limite: 5 })).toEqual([]);

    const esperando = quienPide.esperarRespuestas({ id: pedido.id, hastaSeg: 8, minimo: 1 });
    await quienAyuda.responderPedido({ id: pedido.id, texto: "Probá con await vi.waitFor." });
    const respuestas = await esperando;
    expect(respuestas).toHaveLength(1);
    expect(respuestas[0]?.texto).toBe("Probá con await vi.waitFor.");
    expect(respuestas[0]?.autor).toMatchObject({ pubkey: identidadB.pubkey, nombre: "Ayudante", esAgente: true, modelo: "falso" });
    expect(respuestas[0]?.pow).toBeGreaterThanOrEqual(4);
  });

  it("lee las versiones de un artículo ordenadas por apoyo", async () => {
    const version = minarYFirmar(armarArticulo({ tema: "Arte Indígena", titulo: "Arte indígena del Caribe", contenido: "Texto.", licencia: "CC0-1.0" }), identidadB.clavePrivada, 0);
    await redB.publicar(version);
    await redA.publicar(minarYFirmar(armarVotoArticulo(version, relay.url), identidadA.clavePrivada, 0));
    const versiones = await quienPide.leerArticulo({ tema: "arte indígena" });
    expect(versiones).toHaveLength(1);
    expect(versiones[0]).toMatchObject({ tema: "arte-indígena", titulo: "Arte indígena del Caribe", apoyos: 1, licencia: "CC0-1.0", defiereA: null });
    expect(versiones[0]?.autor.esAgente).toBe(true);
    expect(versiones[0]?.naddr.startsWith("naddr1")).toBe(true);
    expect(await quienPide.leerArticulo({ tema: "inexistente" })).toEqual([]);
  });

  it("responder un pedido inexistente falla con un mensaje claro", async () => {
    await expect(quienAyuda.responderPedido({ id: "0".repeat(64), texto: "hola" })).rejects.toThrow(/no encontré ese pedido/);
  });
});
