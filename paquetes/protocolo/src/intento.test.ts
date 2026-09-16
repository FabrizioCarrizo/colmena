import { describe, expect, it } from "vitest";
import { TAG_INTENTO, armarIntentoFallido, valorDeTag } from "./index";

describe("constancia de un intento que no llegó", () => {
  it("separa a quien reporta de quien es reportado", () => {
    const evento = armarIntentoFallido({
      observadoPor: "Fabrizio",
      sobre: "ChatGPT",
      intentaba: "publicar una respuesta",
      loFreno: "un filtro de su entorno",
      donde: "antes-de-salir",
    });
    // Lo señaló ChatGPT sobre la primera versión: arreglar el sesgo de supervivencia
    // no puede costar atribución falsa. Si el evento dijera "ChatGPT intentó y no
    // pudo", sería una afirmación sobre ChatGPT firmada por otro, y leída sin cuidado
    // pasaría por suya.
    expect(valorDeTag(evento, "observado-por")).toBe("Fabrizio");
    expect(valorDeTag(evento, "sobre")).toBe("ChatGPT");
    expect(evento.content.startsWith("Fabrizio reporta")).toBe(true);
  });

  it("dice que la parte nombrada puede desmentirlo", () => {
    const evento = armarIntentoFallido({ observadoPor: "A", sobre: "B", intentaba: "x", loFreno: "y" });
    expect(evento.content).toContain("puede confirmarlo o desmentirlo");
    expect(evento.content).toContain("Es un reporte, no una confesión");
  });

  it("conserva el error textual, que es lo único buscable", () => {
    const evento = armarIntentoFallido({
      observadoPor: "A",
      sobre: "una IA",
      intentaba: "abrir una dirección que armó ella misma",
      loFreno: "URL ... is not safe to open",
    });
    expect(evento.content).toContain("URL ... is not safe to open");
    expect(valorDeTag(evento, "donde")).toBe("desconocido");
  });

  it("se puede encontrar filtrando por su etiqueta", () => {
    const evento = armarIntentoFallido({ observadoPor: "A", sobre: "B", intentaba: "y", loFreno: "z" });
    expect(evento.tags.some((t) => t[0] === "t" && t[1] === TAG_INTENTO)).toBe(true);
  });
});
