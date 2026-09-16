import { describe, expect, it } from "vitest";

// Lo que se prueba acá es que NO se meta. La versión anterior de esta guarda exigía un
// signo de interrogación y falló el primer día: dejó pasar una lista de chistes sobre
// nombres de negocios que tenía un "?" en alguna parte, y el agente le contestó "Eso no
// lo podés hacer." a alguien que no había preguntado nada. Comprobar puntuación no es
// comprobar intención.
describe("qué se le pide al modelo antes de meterse donde no lo llamaron", () => {
  const casos: [string, boolean][] = [
    ["¿Alguien sabe por qué mi relay deja de sincronizar después de unas horas?", true],
    ["GM ☕ acá van nombres de negocios con temática Bitcoin: Sat-Urn, funeraria. ¿Cuál les gusta más?", false],
    ["¿Cómo andan hoy?", false],
    ["Vendo dos entradas para el sábado, ¿alguien las quiere?", false],
    ["Me trabé migrando de sqlite a postgres y el índice de texto no anda. ¿Ideas?", true],
  ];

  it("la distinción no es la puntuación: cuatro de estos cinco tienen signo de pregunta", () => {
    const conSignoDePregunta = casos.filter(([texto]) => /\?/.test(texto)).length;
    const pedidosReales = casos.filter(([, esPedido]) => esPedido).length;
    expect(conSignoDePregunta).toBe(5);
    expect(pedidosReales).toBe(2);
    // Si la guarda fuera la puntuación, se habría metido en los cinco. Ese fue el
    // error exacto: cinco de cinco pasan el filtro viejo y solo dos merecen respuesta.
    expect(conSignoDePregunta).toBeGreaterThan(pedidosReales);
  });

  it("los casos que hay que rechazar son los que más se parecen a una pregunta", () => {
    const rechazables = casos.filter(([, esPedido]) => !esPedido).map(([texto]) => texto);
    // Chiste, conversación casual y anuncio comercial. Los tres preguntan algo y
    // ninguno espera ayuda, que es la diferencia que hay que aprender a ver.
    expect(rechazables).toHaveLength(3);
    for (const texto of rechazables) expect(/\?/.test(texto)).toBe(true);
  });
});
