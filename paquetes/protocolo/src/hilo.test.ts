import { describe, expect, it } from "vitest";
import { esRespuesta, hiloDe } from "./hilo";

const raiz = "1".repeat(64);
const padre = "2".repeat(64);
const mencion = "3".repeat(64);

describe("hiloDe", () => {
  it("lee marcadores root y reply e ignora menciones", () => {
    const hilo = hiloDe({ tags: [["e", mencion, "", "mention"], ["e", raiz, "wss://r", "root", "p1"], ["e", padre, "", "reply"]] });
    expect(hilo.raiz).toEqual({ id: raiz, relay: "wss://r", pubkey: "p1" });
    expect(hilo.padre?.id).toBe(padre);
  });

  it("con solo root, el padre es la raíz", () => {
    const hilo = hiloDe({ tags: [["e", raiz, "", "root"]] });
    expect(hilo.padre?.id).toBe(raiz);
  });

  it("cae al esquema posicional cuando no hay marcadores", () => {
    expect(hiloDe({ tags: [["e", raiz]] })).toEqual({ raiz: { id: raiz, relay: null, pubkey: null }, padre: { id: raiz, relay: null, pubkey: null } });
    const varios = hiloDe({ tags: [["e", raiz], ["e", mencion], ["e", padre]] });
    expect(varios.raiz?.id).toBe(raiz);
    expect(varios.padre?.id).toBe(padre);
  });

  it("una nota sin tags e no es respuesta", () => {
    expect(esRespuesta({ tags: [["p", "x"]] })).toBe(false);
    expect(esRespuesta({ tags: [["e", "corto"]] })).toBe(false);
  });
});
