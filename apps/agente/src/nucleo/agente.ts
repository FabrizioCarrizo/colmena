import type { Event as EventoNostr } from "nostr-tools/pure";
import { ahora, armarPerfilDeAgente, armarPregunta, decidirDeriva, esDeLaColmena, minarYFirmar, validarPedido, verboDe } from "@colmena/protocolo";
import type { DatosPerfilAgente } from "@colmena/protocolo";
import { crearRed } from "@colmena/red";
import { armarBitacoraConsolidada, armarEntradaDeBitacora, comoContexto, crearBitacora } from "./bitacora";
import { armarListaDeConfianza, crearConfianza, leccionesAjenasComoContexto } from "./confianza";
import type { Red, Suscripcion } from "@colmena/red";
import type { Billetera } from "./billetera";
import { CerebroNoDisponible } from "./cerebro";
import type { Cerebro } from "./cerebro";
import type { Estado } from "./estado";
import type { Identidad } from "@colmena/identidad";
import type { Contexto, Oficio, Personas, Politica } from "./oficio";
import { registrarEnConsola } from "./registro";
import type { Registrar } from "./registro";

// Cuánto puede pasar sin recibir un solo evento antes de sospechar de uno mismo.
// La red publica todo el tiempo: veinte minutos de silencio absoluto es raro, y
// volver a suscribirse de más no cuesta nada.
const MINUTOS_SIN_ESCUCHAR = 20;

export interface OpcionesAgente {
  // Cuántas anotaciones propias recuerda al arrancar. 0 lo deja sin memoria.
  cuantoRecuerda?: number;
  // Cuántas lecciones de otros tiene en cuenta, y a cuántos puede confiar.
  cuantoEscucha?: number;
  maxConfiados?: number;
  identidad: Identidad;
  relays: string[];
  cerebro: Cerebro;
  billetera: Billetera;
  estado: Estado;
  oficios: Oficio[];
  politica: Politica;
  personas: Personas;
  perfil: DatosPerfilAgente | null;
  registrar?: Registrar;
  red?: Red;
}

export interface Agente {
  pubkey: string;
  iniciar(): Promise<void>;
  detener(): Promise<void>;
}

const REINTENTOS_MAX = 3;

export function crearAgente(opciones: OpcionesAgente): Agente {
  const { identidad, relays, estado, politica, oficios } = opciones;
  const registrar = opciones.registrar ?? registrarEnConsola;
  const red = opciones.red ?? crearRed(relays);
  const suscripciones: Suscripcion[] = [];
  const temporizadores = new Set<NodeJS.Timeout>();
  const intervalos: NodeJS.Timeout[] = [];
  let detenido = false;

  const bitacora = crearBitacora({
    red,
    pubkey: identidad.pubkey,
    cuantasRecordar: opciones.cuantoRecuerda ?? 20,
    registrar,
    publicar: async (datos) => {
      await ctx.publicarFirmado(armarEntradaDeBitacora(datos, relays[0] ?? ""), politica.powRespuesta);
    },
    publicarConsolidada: async (lecciones, releidas, hasta) => {
      await ctx.publicarFirmado(armarBitacoraConsolidada({ lecciones, releidas, hasta }), 0);
    },
  });

  const confianza = crearConfianza({
    red,
    pubkey: identidad.pubkey,
    maxConfiados: opciones.maxConfiados ?? 100,
    registrar,
    publicarLista: async (confiados) => {
      await ctx.publicarFirmado(armarListaDeConfianza(confiados), 0);
    },
  });

  const ctx: Contexto = {
    red,
    bitacora,
    confianza,
    // Dos memorias, separadas a propósito: lo que aprendió él lleva su firma, lo
    // que aprendieron otros lleva la de ellos y no se mezcla nunca.
    async personaCon(base) {
      const [propio, ajeno] = await Promise.all([
        bitacora.recordar(),
        confianza.leccionesAjenas(opciones.cuantoEscucha ?? 10),
      ]);
      return base + comoContexto(propio) + leccionesAjenasComoContexto(ajeno);
    },
    cerebro: opciones.cerebro,
    billetera: opciones.billetera,
    estado,
    identidad,
    relays,
    politica,
    personas: opciones.personas,
    registrar,
    async publicarFirmado(plantilla, bits) {
      const evento = minarYFirmar(plantilla, identidad.clavePrivada, bits);
      const resultado = await red.publicar(evento);
      if (resultado.exitos.length === 0) {
        throw new Error(`ningún relay aceptó el evento: ${resultado.fallos.map((f) => `${f.relay}: ${f.motivo}`).join("; ")}`);
      }
      return evento;
    },
    async preguntarALaRed(texto, opcionesPregunta = {}) {
      const inicioDelDia = ahora() - 24 * 3600;
      if (estado.preguntasPropiasDesde(inicioDelDia) >= politica.maxPreguntasPorDia) {
        registrar("aviso", "no pregunto a la red: tope diario de preguntas propias alcanzado");
        return null;
      }
      const plantilla = armarPregunta(texto, { temas: opcionesPregunta.temas ?? [] });
      for (const pubkey of opcionesPregunta.menciones ?? []) plantilla.tags.push(["p", pubkey]);
      if (opcionesPregunta.cita) plantilla.tags.push(["q", opcionesPregunta.cita.id, relays[0] ?? "", opcionesPregunta.cita.pubkey]);
      const evento = await ctx.publicarFirmado(plantilla, politica.powMinimo);
      estado.registrarPreguntaPropia();
      estado.guardar();
      registrar("info", "pregunta propia publicada", { id: evento.id });
      return evento.id;
    },
  };

  function agendar(demoraSeg: number, tarea: () => Promise<void>): void {
    const temporizador = setTimeout(() => {
      temporizadores.delete(temporizador);
      if (!detenido) void tarea();
    }, demoraSeg * 1000);
    temporizadores.add(temporizador);
  }

  async function ejecutar(oficio: Oficio, evento: EventoNostr, intento = 1): Promise<void> {
    try {
      await oficio.manejar(evento, ctx);
    } catch (error) {
      if (error instanceof CerebroNoDisponible && intento < REINTENTOS_MAX) {
        registrar("aviso", `cerebro no disponible, reintento ${intento + 1} de ${REINTENTOS_MAX}`, { oficio: oficio.nombre, evento: evento.id, motivo: error.message });
        agendar(30 * intento, () => ejecutar(oficio, evento, intento + 1));
        return;
      }
      registrar("error", "el oficio falló", { oficio: oficio.nombre, evento: evento.id, motivo: error instanceof Error ? error.message : String(error) });
    } finally {
      estado.guardar();
    }
  }

  function dentroDeLimites(evento: EventoNostr): string | null {
    const { limites } = politica;
    const momento = ahora();
    if (estado.respuestasDesde(momento - 3600) >= limites.maxPorHora) return "tope por hora";
    if (estado.respuestasDesde(momento - 24 * 3600) >= limites.maxPorDia) return "tope por día";
    if (estado.respuestasDeAutorDesde(evento.pubkey, momento - 24 * 3600) >= limites.maxPorAutorPorDia) return "tope por autor";
    return null;
  }

  async function procesar(oficio: Oficio, evento: EventoNostr): Promise<void> {
    if (detenido || evento.pubkey === identidad.pubkey) return;
    const clave = `${oficio.nombre}:${evento.id}`;
    if (estado.yaAtendido(clave)) return;

    // Solo los pedidos abiertos (con verbo) pasan por validación, topes y deriva. Un
    // evento sin verbo (una reacción, una imagen) es material para el oficio, no un
    // pedido de alguien, y no cuesta inferencia por sí mismo.
    // Sin la etiqueta de la red, no nos llamaron: se mira pero no se contesta.
    if (verboDe(evento) !== null && esDeLaColmena(evento)) {
      const validacion = validarPedido(evento, politica.powMinimo);
      if (!validacion.valido) {
        registrar("aviso", "pedido descartado", { motivo: validacion.motivo, evento: evento.id, oficio: oficio.nombre });
        estado.marcarAtendido(clave);
        return;
      }
      const tope = dentroDeLimites(evento);
      if (tope !== null) {
        registrar("aviso", `pedido pospuesto: ${tope}`, { evento: evento.id, oficio: oficio.nombre });
        return;
      }
      const decision = await decidirDeriva(evento.id, identidad.pubkey, politica.deriva);
      estado.marcarAtendido(clave);
      if (!decision.responde) {
        registrar("info", "deriva: este pedido no me toca", { evento: evento.id, oficio: oficio.nombre });
        return;
      }
      registrar("info", "pedido aceptado", { evento: evento.id, oficio: oficio.nombre, verbo: validacion.verbo, demoraSeg: decision.demoraSeg });
      agendar(decision.demoraSeg, () => ejecutar(oficio, evento));
      return;
    }

    estado.marcarAtendido(clave);
    await ejecutar(oficio, evento);
  }

  return {
    pubkey: identidad.pubkey,

    async iniciar() {
      detenido = false;
      if (opciones.perfil) {
        const perfil = minarYFirmar(armarPerfilDeAgente(opciones.perfil), identidad.clavePrivada, 0);
        const resultado = await red.publicar(perfil);
        registrar("info", "perfil publicado", { relays: resultado.exitos, fallos: resultado.fallos.length });
      }
      // Un agente sordo es indistinguible de un agente tranquilo, y esa fue la falla
      // más cara de todas: Obrera estuvo veintitrés horas corriendo con cero
      // conexiones abiertas, sin un error en el registro, mientras launchd la daba por
      // sana. La causa fue un arreglo anterior: para que un relay caído no tumbara el
      // proceso se silenciaron los errores de WebSocket, y con ellos se silenció el
      // aviso de que las conexiones se habían ido.
      //
      // No alcanza con reconectar cuando falla, porque nadie se entera de que falló.
      // Hay que comprobar lo contrario: que sigue llegando algo. Si en una ventana
      // larga no llegó ni un evento de una red que publica todo el tiempo, la
      // explicación probable no es el silencio, es la sordera.
      let ultimoLatido = Date.now();
      const vigilar = setInterval(() => {
        if (detenido) return;
        const minutosCallado = (Date.now() - ultimoLatido) / 60000;
        if (minutosCallado < MINUTOS_SIN_ESCUCHAR) return;
        registrar("aviso", "no recibo nada hace rato, me vuelvo a suscribir", { minutos: Math.round(minutosCallado) });
        for (const suscripcion of suscripciones.splice(0)) suscripcion.cerrar();
        for (const oficio of oficios) {
          for (const filtro of oficio.filtros(ctx)) {
            suscripciones.push(red.suscribir(filtro, (evento) => {
              ultimoLatido = Date.now();
              void procesar(oficio, evento);
            }));
          }
        }
        ultimoLatido = Date.now();
      }, 60_000);
      intervalos.push(vigilar);

      for (const oficio of oficios) {
        for (const filtro of oficio.filtros(ctx)) {
          suscripciones.push(red.suscribir(filtro, (evento) => {
            ultimoLatido = Date.now();
            void procesar(oficio, evento);
          }));
        }
        const periodico = oficio.periodico;
        if (periodico) {
          let corriendo = false;
          intervalos.push(
            setInterval(() => {
              if (corriendo || detenido) return;
              corriendo = true;
              periodico
                .correr(ctx)
                .catch((error: unknown) => registrar("error", "la tarea periódica falló", { oficio: oficio.nombre, motivo: error instanceof Error ? error.message : String(error) }))
                .finally(() => {
                  corriendo = false;
                  estado.guardar();
                });
            }, periodico.cadaSeg * 1000),
          );
        }
      }
      // Lo primero que hace al arrancar es leer lo que él mismo aprendió antes, y
      // desde cuándo seguir. Las dos cosas salen de la red: una máquina nueva, o
      // la misma con el disco borrado, retoma donde quedó en vez de empezar de
      // cero y volver a reaccionar a todo lo que ya había atendido.
      const aprendido = await bitacora.recordar();
      const ultima = await bitacora.desdeCuandoSeguir();
      if (ultima !== null) estado.adelantarSince(ultima);
      registrar("info", "agente escuchando", {
        npub: identidad.npub,
        oficios: oficios.map((o) => o.nombre),
        relays,
        cerebro: opciones.cerebro.nombre,
        recuerda: aprendido.length,
      });
    },

    async detener() {
      detenido = true;
      for (const temporizador of temporizadores) clearTimeout(temporizador);
      temporizadores.clear();
      for (const intervalo of intervalos) clearInterval(intervalo);
      intervalos.length = 0;
      for (const suscripcion of suscripciones) suscripcion.cerrar();
      suscripciones.length = 0;
      estado.guardar();
      red.cerrar();
    },
  };
}
