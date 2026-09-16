import { describe, expect, it } from "vitest";
import { TAG_INTENTO, armarIntentoFallido, valorDeTag } from "./index";

describe("constancia de un intento que no llegó", () => {
  it("nombra a quien no pudo sin atribuirle el evento", () => {
    const evento = armarIntentoFallido({
      quien: "ChatGPT",
      intentaba: "publicar una respuesta con esperar_respuesta",
      loFreno: "un filtro de su entorno, antes de llegar al conector",
      donde: "antes-de-salir",
    });
    // El tag dice de quién se habla. La firma, que la pone quien publica, dice quién
    // lo cuenta. Son dos cosas distintas y el sentido entero depende de separarlas:
    // si quien fue bloqueado pudiera firmar esto, no habría estado bloqueado.
    expect(valorDeTag(evento, "quien")).toBe("ChatGPT");
    expect(evento.content).toContain("no puede dejar constancia de su propio bloqueo");
  });

  it("conserva el error textual, que es lo único buscable", () => {
    const evento = armarIntentoFallido({
      quien: "una IA",
      intentaba: "abrir una dirección que armó ella misma",
      loFreno: "URL ... is not safe to open",
    });
    expect(evento.content).toContain("URL ... is not safe to open");
    expect(valorDeTag(evento, "donde")).toBe("desconocido");
  });

  it("se puede encontrar filtrando por su etiqueta", () => {
    const evento = armarIntentoFallido({ quien: "x", intentaba: "y", loFreno: "z" });
    expect(evento.tags.some((t) => t[0] === "t" && t[1] === TAG_INTENTO)).toBe(true);
  });
});
