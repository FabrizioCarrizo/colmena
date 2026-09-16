import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as nip19 from "nostr-tools/nip19";
import { POW_PEDIDO, POW_RESPUESTA } from "@colmena/protocolo";
import type { Esfuerzo } from "./cerebros/claude";
import type { Personas, Politica } from "./nucleo/oficio";

export type TipoCerebro = "claude" | "local" | "falso";

export interface ConfigCurar {
  duenoPubkey: string | null;
  intereses: string | null;
  temasCurados: string[];
  palabrasClave: string[];
  umbralConfianza: number;
  maxClasificacionesPorDia: number;
  preguntarAlAutor: boolean;
}

export interface Config {
  relays: string[];
  cerebro: TipoCerebro;
  modelo: string | null;
  esfuerzo: Esfuerzo | null;
  ollamaUrl: string;
  razonamiento: boolean;
  oficios: string[];
  nombre: string;
  descripcion: string;
  operador: string;
  publicarPerfil: boolean;
  rutaEstado: string;
  rutaClave: string;
  nsec: string | undefined;
  personas: Personas;
  politica: Politica;
  curar: ConfigCurar;
  falsoCoincide: boolean;
  tareas: { precioMinimoMsats: number; revisarCobrosSeg: number; nwcUrl: string | null };
  sintetizar: { revisarAceptacionesSeg: number; licencia: string; maxSintesisPorDia: number };
  cuantoRecuerda: number;
  cuantoEscucha: number;
  maxConfiados: number;
  maxAnotacionesPorDia: number;
  releerCada: number;
  revisarAprendizajeSeg: number;
}

const ESFUERZOS: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];

function texto(entorno: NodeJS.ProcessEnv, nombre: string, porDefecto: string): string {
  const valor = entorno[nombre];
  return valor !== undefined && valor.trim().length > 0 ? valor.trim() : porDefecto;
}

function numero(entorno: NodeJS.ProcessEnv, nombre: string, porDefecto: number): number {
  const crudo = entorno[nombre];
  const valor = Number(crudo);
  return crudo !== undefined && crudo !== "" && Number.isFinite(valor) ? valor : porDefecto;
}

function bandera(entorno: NodeJS.ProcessEnv, nombre: string, porDefecto: boolean): boolean {
  const valor = entorno[nombre]?.trim().toLowerCase();
  if (valor === undefined || valor === "") return porDefecto;
  return valor === "si" || valor === "sí" || valor === "true" || valor === "1";
}

function lista(entorno: NodeJS.ProcessEnv, nombre: string, porDefecto: string[]): string[] {
  const valor = entorno[nombre];
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  return valor
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);
}

function esfuerzo(entorno: NodeJS.ProcessEnv): Esfuerzo | null {
  const valor = entorno.ESFUERZO?.trim();
  if (!valor) return null;
  const encontrado = ESFUERZOS.find((e) => e === valor);
  if (!encontrado) throw new Error(`ESFUERZO inválido: ${valor}. Opciones: ${ESFUERZOS.join(", ")}`);
  return encontrado;
}

function tipoCerebro(entorno: NodeJS.ProcessEnv): TipoCerebro {
  const valor = texto(entorno, "CEREBRO", "claude");
  if (valor === "claude" || valor === "local" || valor === "falso") return valor;
  throw new Error(`CEREBRO inválido: ${valor}. Opciones: claude, local, falso`);
}

function leerArchivo(ruta: string, obligatorio: boolean): string | null {
  const absoluta = resolve(ruta);
  if (!existsSync(absoluta)) {
    if (obligatorio) throw new Error(`no encuentro el archivo ${absoluta}`);
    return null;
  }
  return readFileSync(absoluta, "utf8");
}

function pubkeyDesdeNpub(npub: string | undefined): string | null {
  const limpio = npub?.trim();
  if (!limpio) return null;
  const decodificado = nip19.decode(limpio);
  if (decodificado.type !== "npub") throw new Error("DUENO_NPUB tiene que ser un npub (NIP-19)");
  return decodificado.data;
}

export function cargarConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const nombre = texto(entorno, "NOMBRE", "agente sin nombre");
  const operador = texto(entorno, "OPERADOR", "alguien que prefirió no decirlo");
  const intereses = leerArchivo(texto(entorno, "INTERESES", "intereses.md"), false);
  const reemplazos = (plantilla: string): string =>
    plantilla.replaceAll("{NOMBRE}", nombre).replaceAll("{OPERADOR}", operador).replaceAll("{INTERESES}", intereses?.trim() ?? "(sin intereses declarados)");

  return {
    relays: lista(entorno, "RELAYS", ["wss://nos.lol", "wss://relay.damus.io"]),
    cerebro: tipoCerebro(entorno),
    modelo: entorno.MODELO?.trim() || null,
    esfuerzo: esfuerzo(entorno),
    ollamaUrl: texto(entorno, "OLLAMA_URL", "http://localhost:11434"),
    razonamiento: bandera(entorno, "RAZONAMIENTO", false),
    oficios: lista(entorno, "OFICIOS", ["responder"]),
    nombre,
    descripcion: texto(entorno, "DESCRIPCION", "Agente de la red abierta. Respondo preguntas y pedidos de ayuda."),
    operador,
    publicarPerfil: bandera(entorno, "PUBLICAR_PERFIL", true),
    rutaEstado: texto(entorno, "RUTA_ESTADO", "estado/estado.json"),
    rutaClave: texto(entorno, "RUTA_CLAVE", "estado/clave.txt"),
    nsec: entorno.NOSTR_NSEC,
    personas: {
      preguntas: reemplazos(leerArchivo(texto(entorno, "PERSONA_PREGUNTAS", "personas/preguntas.md"), true) ?? ""),
      ayuda: reemplazos(leerArchivo(texto(entorno, "PERSONA_AYUDA", "personas/ayuda.md"), true) ?? ""),
      curar: reemplazos(leerArchivo(texto(entorno, "PERSONA_CURAR", "personas/curar.md"), true) ?? ""),
      tareas: reemplazos(leerArchivo(texto(entorno, "PERSONA_TAREAS", "personas/tareas.md"), true) ?? ""),
      sintetizar: reemplazos(leerArchivo(texto(entorno, "PERSONA_SINTETIZAR", "personas/sintetizar.md"), true) ?? ""),
      aprender: reemplazos(leerArchivo(texto(entorno, "PERSONA_APRENDER", "personas/aprender.md"), true) ?? ""),
    },
    politica: {
      powMinimo: numero(entorno, "POW_MINIMO", POW_PEDIDO),
      powRespuesta: numero(entorno, "POW_RESPUESTA", POW_RESPUESTA),
      deriva: {
        probabilidad: numero(entorno, "PROBABILIDAD", 1),
        demoraMaxSeg: numero(entorno, "DERIVA_MAX_SEG", 600),
      },
      limites: {
        maxPorHora: numero(entorno, "MAX_POR_HORA", 20),
        maxPorDia: numero(entorno, "MAX_POR_DIA", 100),
        maxPorAutorPorDia: numero(entorno, "MAX_POR_AUTOR_POR_DIA", 3),
      },
      maxPreguntasPorDia: numero(entorno, "MAX_PREGUNTAS_POR_DIA", 5),
      // Apagado por defecto y a propósito. Prenderlo hace que el agente le hable a
      // gente que no lo llamó, y eso lo decide quien lo corre y responde por él, no
      // quien escribió este código. Con la lista de temas vacía no se mete en ningún
      // lado aunque esté prendido: hay que decir dónde.
      responderSinQueMeLlamen: entorno.RESPONDER_SIN_QUE_ME_LLAMEN === "si",
      temasAbiertos: (entorno.TEMAS_ABIERTOS ?? "").split(",").map((t) => t.trim()).filter((t) => t.length > 0),
      maxIntromisionesPorDia: numero(entorno, "MAX_INTROMISIONES_POR_DIA", 3),
    },
    falsoCoincide: bandera(entorno, "FALSO_COINCIDE", false),
    cuantoRecuerda: numero(entorno, "CUANTO_RECUERDA", 20),
    cuantoEscucha: numero(entorno, "CUANTO_ESCUCHA", 10),
    maxConfiados: numero(entorno, "MAX_CONFIADOS", 100),
    maxAnotacionesPorDia: numero(entorno, "MAX_ANOTACIONES_POR_DIA", 10),
    releerCada: numero(entorno, "RELEER_CADA", 15),
    revisarAprendizajeSeg: numero(entorno, "REVISAR_APRENDIZAJE_SEG", 900),
    tareas: {
      precioMinimoMsats: numero(entorno, "PRECIO_MINIMO_MSATS", 1000),
      revisarCobrosSeg: numero(entorno, "REVISAR_COBROS_SEG", 60),
      nwcUrl: entorno.NWC_URL?.trim() || null,
    },
    sintetizar: {
      revisarAceptacionesSeg: numero(entorno, "REVISAR_ACEPTACIONES_SEG", 60),
      licencia: texto(entorno, "LICENCIA", "CC-BY-SA-4.0"),
      maxSintesisPorDia: numero(entorno, "MAX_SINTESIS_POR_DIA", 20),
    },
    curar: {
      duenoPubkey: pubkeyDesdeNpub(entorno.DUENO_NPUB),
      intereses,
      temasCurados: lista(entorno, "TEMAS_CURADOS", []),
      palabrasClave: lista(entorno, "PALABRAS_CLAVE", []),
      umbralConfianza: numero(entorno, "UMBRAL_CONFIANZA", 0.6),
      maxClasificacionesPorDia: numero(entorno, "MAX_CLASIFICACIONES_POR_DIA", 200),
      preguntarAlAutor: bandera(entorno, "PREGUNTAR_AL_AUTOR", false),
    },
  };
}
