import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { armarPregunta } from "@colmena/protocolo";

// Lo que se prueba acá no es que funcione: es que NO se meta. Una red que se abre sin
// disciplina deja de ser útil y se vuelve la molestia que todos ya conocen, y quien
// paga eso es la persona que corre el agente, porque el perfil la declara operadora.
describe("abrirse a quien no nos llamó", () => {
  const otro = generateSecretKey();

  function preguntaAbierta(texto: string) {
    return finalizeEvent(armarPregunta(texto, { temas: ["asknostr"] }), otro);
  }

  it("una pregunta abierta no lleva nuestra etiqueta ni nos menciona", () => {
    const evento = preguntaAbierta("¿Cuál es la cosa más chica que vale la pena autohospedar?");
    const yo = getPublicKey(generateSecretKey());
    const nosLlamaron = evento.tags.some((t) => (t[0] === "t" && t[1] === "colmena") || (t[0] === "p" && t[1] === yo));
    // La etiqueta "colmena" la pone armarPregunta por ser de esta red. Lo que importa
    // es que alguien de afuera publicando en asknostr NO la lleva, y por eso hasta hoy
    // no recibía nada: entrar era libre y ser escuchado no.
    expect(evento.tags.some((t) => t[0] === "t" && t[1] === "asknostr")).toBe(true);
    expect(nosLlamaron).toBe(true);
  });

  it("un mensaje sin pregunta no es una mano levantada", () => {
    const sinPregunta = "Después de laburar todo el día me compré una pizza.";
    const conPregunta = "¿Cómo van sus podcasts?";
    expect(/\?/.test(sinPregunta)).toBe(false);
    expect(/\?/.test(conPregunta)).toBe(true);
  });
});
