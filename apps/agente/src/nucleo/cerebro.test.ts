import { describe, expect, it } from "vitest";
import { reconocerNoSaber } from "./cerebro";

describe("reconocer que no se sabe", () => {
  it("entiende el castellano con y sin acento", () => {
    // El límite de palabra de las expresiones regulares se calcula sobre letras
    // ASCII: con `\b` después de la É, "no se" contaba como no saber y "no sé" no.
    // El acento decidía si un agente sabía o no, que es el tipo de error que solo
    // aparece cuando el idioma no es inglés.
    for (const texto of ["NO SÉ. Es sobre apicultura.", "no sé, es sobre relays", "No sé nada de esto", "NO SE: es sobre abejas", "NO SÉ"]) {
      expect(reconocerNoSaber(texto).tipo, texto).toBe("no-se");
    }
  });

  it("no confunde una respuesta que empieza parecido", () => {
    for (const texto of ["No sabía que existía, pero lo busqué y es así.", "Se sabe que las abejas ventilan la colmena.", "Nose", "No, sé que funciona."]) {
      expect(reconocerNoSaber(texto).tipo, texto).toBe("texto");
    }
  });

  it("separa el tema del resto, para saber a quién pasarle la pregunta", () => {
    const dicho = reconocerNoSaber("NO SÉ. Es sobre apicultura y ventilación.");
    expect(dicho).toEqual({ tipo: "no-se", sobre: "Es sobre apicultura y ventilación." });
  });
});
