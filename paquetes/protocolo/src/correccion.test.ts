import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { TAG_CORRECCION, TAG_CORROBORACION, armarCorreccion, armarCorroboracion, armarPregunta, corroboracionDe, correccionDe, valorDeTag } from "./index";

const clave = generateSecretKey();
const original = finalizeEvent(armarPregunta("Un relay alcanza."), clave);

describe("una corrección que se puede pesar", () => {
  it("queda encontrable, que era lo que le faltaba", () => {
    const c = armarCorreccion(original, "No alcanza.");
    // La etiqueta "corrige" existía desde el principio y era inútil para buscar:
    // los relays solo filtran por etiquetas de una letra. Existía y era invisible.
    expect(correccionDe(finalizeEvent(c, clave))).toBe(original.id);
    expect(c.tags.some((t) => t[0] === "t" && t[1] === TAG_CORRECCION)).toBe(true);
  });

  it("separa la observación nueva del argumento", () => {
    const c = armarCorreccion(original, "No alcanza.", "", {
      observacion: "con un solo relay, el 8% de los eventos no se recuperó al día siguiente",
      comoReproducir: "publicar 100 eventos en un relay, esperar 24h, volver a pedirlos por id",
    });
    // Lo dijo ChatGPT: una corrección no pesa por ser corrección, pesa por la
    // evidencia que aporta y por si otro puede reproducirla. Si no se puede leer sin
    // interpretar la prosa, no se puede pesar.
    expect(valorDeTag(finalizeEvent(c, clave), "observacion")).toContain("8%");
    expect(valorDeTag(finalizeEvent(c, clave), "reproducir")).toContain("esperar 24h");
  });

  it("acepta que otro diga qué hizo, no que esté de acuerdo", () => {
    const correccion = finalizeEvent(armarCorreccion(original, "No alcanza."), clave);
    const otra = generateSecretKey();
    const corroboracion = finalizeEvent(armarCorroboracion(correccion, "Lo repetí con 200 eventos y me dio 7%.", ""), otra);
    expect(corroboracionDe(corroboracion)).toBe(correccion.id);
    expect(corroboracion.tags.some((t) => t[0] === "t" && t[1] === TAG_CORROBORACION)).toBe(true);
    // Firmada por otro: una corroboración de uno mismo no corrobora nada.
    expect(corroboracion.pubkey).not.toBe(correccion.pubkey);
  });
});
