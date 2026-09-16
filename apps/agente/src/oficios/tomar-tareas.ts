import { KIND_TAREA, LARGO_MAX_RESPUESTA, ahora, armarEntrega, armarFeedback, textoDe, valorDeTag } from "@colmena/protocolo";
import { envolverComoDatos } from "../nucleo/cerebro";
import type { Oficio } from "../nucleo/oficio";

export interface OpcionesTomarTareas {
  // Presupuesto mínimo, en milisatoshis, para que valga la pena gastar inferencia.
  precioMinimoMsats: number;
  revisarCobrosSeg: number;
}

const CONTEXTO = "Microtarea paga publicada en la red (NIP-90). Entregá exactamente lo que pide, en el formato que pide.";

function recortar(texto: string): string {
  return texto.length > LARGO_MAX_RESPUESTA ? `${texto.slice(0, LARGO_MAX_RESPUESTA - 1)}…` : texto;
}

// Toma microtareas NIP-90 con presupuesto, las resuelve y entrega con una factura
// Lightning. Entrega primero y cobra después: la entrega es pública de todas formas,
// y el escrow queda para más adelante. Una tarea periódica mira qué facturas se
// pagaron.
export function oficioTomarTareas(opciones: OpcionesTomarTareas): Oficio {
  return {
    nombre: "tomar-tareas",

    filtros(ctx) {
      return [{ kinds: [KIND_TAREA], "#t": ["tarea"], since: ctx.estado.since }];
    },

    async manejar(evento, ctx) {
      const consigna = textoDe(evento);
      if (consigna === null || ctx.estado.cobroDe(evento.id) !== null) return;
      const presupuesto = Number(valorDeTag(evento, "bid"));
      if (!Number.isFinite(presupuesto) || presupuesto < opciones.precioMinimoMsats) {
        ctx.registrar("info", "tarea: presupuesto insuficiente, la dejo pasar", { tarea: evento.id, presupuesto: valorDeTag(evento, "bid") });
        return;
      }
      const relayPista = ctx.relays[0] ?? "";
      await ctx.publicarFirmado(armarFeedback(evento, "processing", "", relayPista), 0);

      const dicho = await ctx.cerebro.responder(ctx.personas.tareas, envolverComoDatos(consigna, CONTEXTO));
      if (dicho === null) {
        await ctx.publicarFirmado(armarFeedback(evento, "error", "no pude resolver la tarea", relayPista), 0);
        ctx.registrar("aviso", "tarea: el cerebro no dio resultado", { tarea: evento.id });
        return;
      }
      // No es lo mismo fallar que negarse: quien ofreció la tarea merece saber
      // cuál de las dos fue, y nadie cobra por una tarea que decidió no hacer.
      if (dicho.tipo === "rechazo") {
        await ctx.publicarFirmado(armarFeedback(evento, "error", dicho.motivo, relayPista), 0);
        ctx.estado.registrarCobro(evento.id, { hash: "", msats: 0, pagada: true, momento: ahora(), entrega: "" });
        ctx.registrar("info", "tarea rechazada con motivo", { tarea: evento.id, motivo: dicho.motivo });
        return;
      }

      const factura = await ctx.billetera.crearFactura(presupuesto, `Entrega de la tarea ${evento.id.slice(0, 8)}`);
      const entrega = await ctx.publicarFirmado(armarEntrega(evento, recortar(dicho.texto), { montoMsats: presupuesto, bolt11: factura.bolt11, relayPista }), 0);
      ctx.estado.registrarCobro(evento.id, { hash: factura.hash, msats: presupuesto, pagada: false, momento: ahora(), entrega: entrega.id });
      ctx.estado.registrarRespuesta(evento.pubkey);
      ctx.registrar("info", "tarea entregada, esperando el pago", { tarea: evento.id, entrega: entrega.id, msats: presupuesto, billetera: ctx.billetera.nombre });
    },

    periodico: {
      cadaSeg: opciones.revisarCobrosSeg,
      async correr(ctx) {
        for (const [idTarea, cobro] of ctx.estado.cobrosPendientes()) {
          if (await ctx.billetera.estaPagada(cobro.hash)) {
            ctx.estado.marcarCobrado(idTarea);
            ctx.registrar("info", "cobro recibido", { tarea: idTarea, msats: cobro.msats });
          }
        }
      },
    },
  };
}
