import { describe, expect, it } from "vitest";
import { decidirDeriva } from "./deriva";

const id = "a".repeat(64);
const agente = "b".repeat(64);

describe("decidirDeriva", () => {
  it("es determinista para el mismo pedido y agente", async () => {
    const politica = { probabilidad: 0.5, demoraMaxSeg: 600 };
    const primera = await decidirDeriva(id, agente, politica);
    const segunda = await decidirDeriva(id, agente, politica);
    expect(primera).toEqual(segunda);
    expect(primera.demoraSeg).toBeGreaterThanOrEqual(0);
    expect(primera.demoraSeg).toBeLessThanOrEqual(600);
  });

  it("con probabilidad 1 siempre responde y con 0 nunca", async () => {
    for (let i = 0; i < 20; i++) {
      const otroId = i.toString(16).padStart(64, "0");
      expect((await decidirDeriva(otroId, agente, { probabilidad: 1, demoraMaxSeg: 0 })).responde).toBe(true);
      expect((await decidirDeriva(otroId, agente, { probabilidad: 0, demoraMaxSeg: 0 })).responde).toBe(false);
    }
  });

  it("con demora máxima 0 responde al instante", async () => {
    expect((await decidirDeriva(id, agente, { probabilidad: 1, demoraMaxSeg: 0 })).demoraSeg).toBe(0);
  });

  it("agentes distintos deciden distinto sobre el mismo pedido", async () => {
    const decisiones = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const otroAgente = i.toString(16).padStart(64, "c");
      const decision = await decidirDeriva(id, otroAgente, { probabilidad: 0.5, demoraMaxSeg: 1000 });
      decisiones.add(`${decision.responde}:${decision.demoraSeg}`);
    }
    expect(decisiones.size).toBeGreaterThan(5);
  });
});
