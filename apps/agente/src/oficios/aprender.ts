import type { Filter } from "nostr-tools/filter";
import type { Event as EventoNostr } from "nostr-tools/pure";
import { CONTENIDO_ACEPTACION, KIND_NOTA, KIND_REACCION, correccionDe, temasDe } from "@colmena/protocolo";
import { envolverComoDatos } from "../nucleo/cerebro";
import type { Contexto, Oficio } from "../nucleo/oficio";

export interface OpcionesAprender {
  maxAnotacionesPorDia: number;
}

const CONTEXTO_CORRECCION = "Alguien corrigió algo que respondiste. Abajo está tu respuesta original y la corrección.";
const CONTEXTO_ACEPTACION = "Quien preguntó aceptó tu respuesta como la buena. Abajo está la pregunta y lo que contestaste.";
const INSTRUCCION = [
  "",
  "Escribí en una sola frase, en primera persona, qué aprendiste de esto que te sirva la próxima vez.",
  "No expliques lo que pasó: anotá la lección. Si no hay ninguna lección que valga la pena guardar, respondé exactamente: NADA.",
].join("\n");

function referenciaA(evento: EventoNostr): string | null {
  const tagsE = evento.tags.filter((tag) => tag[0] === "e");
  return tagsE[tagsE.length - 1]?.[1] ?? null;
}

// Aprender de lo que le pasó, y sobre todo de haberse equivocado.
//
// Un agente que responde y nunca mira qué pasó después repite sus errores para
// siempre: cada sesión arranca igual de ignorante que la anterior. Acá, cuando
// alguien lo corrige o acepta lo que dijo, el agente escribe en una frase qué
// aprendió y lo publica firmado. La próxima vez que arranque, eso está.
//
// Las correcciones pesan más que los elogios: lo que salió mal es lo más caro de
// aprender y lo primero que se pierde cuando termina una sesión.
export function oficioAprender(opciones: OpcionesAprender): Oficio {
  async function anotar(ctx: Contexto, material: string, contexto: string, fuente: EventoNostr, fueUnError: boolean): Promise<void> {
    const persona = await ctx.personaCon(ctx.personas.aprender);
    const dicho = await ctx.cerebro.responder(persona, envolverComoDatos(material, contexto) + INSTRUCCION);
    if (dicho === null || dicho.tipo === "rechazo") return;
    const leccion = dicho.texto.trim();
    if (leccion.length === 0 || /^NADA\.?$/i.test(leccion)) {
      ctx.registrar("info", "no había lección que guardar", { evento: fuente.id });
      return;
    }
    await ctx.bitacora.anotar({
      aprendizaje: leccion.slice(0, 600),
      fuente: { id: fuente.id, pubkey: fuente.pubkey },
      temas: temasDe(fuente),
      fueUnError,
    });
    // La confianza se gana ayudando. Quien corrigió algo y la corrección dejó una
    // lección que valía la pena guardar, entra en la lista. No entra quien lo
    // pide ni quien elogia: entra quien enseñó algo.
    if (fueUnError) await ctx.confianza.ganada(fuente.pubkey, `me corrigió y la corrección sirvió`);
  }

  return {
    nombre: "aprender",

    filtros(ctx) {
      // Lo que le pasó a lo suyo: correcciones y aceptaciones que lo citan.
      const filtros: Filter[] = [
        { kinds: [KIND_NOTA], "#p": [ctx.identidad.pubkey], since: ctx.estado.since },
        { kinds: [KIND_REACCION], "#p": [ctx.identidad.pubkey], since: ctx.estado.since },
      ];
      return filtros;
    },

    async manejar(evento, ctx) {
      if (evento.pubkey === ctx.identidad.pubkey) return;
      if (ctx.estado.anotacionesDesde(Date.now() / 1000 - 24 * 3600) >= opciones.maxAnotacionesPorDia) return;

      // Una corrección a algo suyo.
      const corrige = evento.kind === KIND_NOTA ? correccionDe(evento) : null;
      if (corrige !== null) {
        const [original] = await ctx.red.consultar({ ids: [corrige] });
        if (!original || original.pubkey !== ctx.identidad.pubkey) return;
        ctx.estado.registrarAnotacion();
        await anotar(ctx, [`Lo que respondiste:`, original.content, "", `La corrección:`, evento.content].join("\n"), CONTEXTO_CORRECCION, evento, true);
        return;
      }

      // Una respuesta suya aceptada por quien preguntó.
      if (evento.kind === KIND_REACCION && evento.content === CONTENIDO_ACEPTACION) {
        const idRespuesta = referenciaA(evento);
        if (idRespuesta === null) return;
        const [respuesta] = await ctx.red.consultar({ ids: [idRespuesta] });
        if (!respuesta || respuesta.pubkey !== ctx.identidad.pubkey) return;
        const raiz = respuesta.tags.find((tag) => tag[0] === "e" && tag[3] === "root")?.[1];
        const [pregunta] = raiz ? await ctx.red.consultar({ ids: [raiz] }) : [];
        if (!pregunta) return;
        ctx.estado.registrarAnotacion();
        await anotar(ctx, [`La pregunta:`, pregunta.content, "", `Lo que contestaste:`, respuesta.content].join("\n"), CONTEXTO_ACEPTACION, pregunta, false);
      }
    },
  };
}
