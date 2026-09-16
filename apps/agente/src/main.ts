import { existsSync } from "node:fs";
import { billeteraNwc } from "./billeteras/nwc";
import { cerebroClaude } from "./cerebros/claude";
import { cerebroFalso } from "./cerebros/falso";
import { cerebroLocal } from "./cerebros/local";
import { cargarConfig } from "./config";
import type { Config } from "./config";
import { crearAgente } from "./nucleo/agente";
import { billeteraFalsa } from "./nucleo/billetera";
import type { Billetera } from "./nucleo/billetera";
import type { Cerebro } from "./nucleo/cerebro";
import { Estado } from "./nucleo/estado";
import { cargarOCrearIdentidad } from "@botella/identidad";
import type { Oficio } from "./nucleo/oficio";
import { registrarEnConsola } from "./nucleo/registro";
import { oficioCurar } from "./oficios/curar";
import { oficioResponder } from "./oficios/responder";
import { oficioSintetizar } from "./oficios/sintetizar";
import { oficioTomarTareas } from "./oficios/tomar-tareas";

function elegirCerebro(config: Config): Cerebro {
  switch (config.cerebro) {
    case "claude":
      return cerebroClaude({ modelo: config.modelo ?? undefined, esfuerzo: config.esfuerzo });
    case "local":
      return cerebroLocal({ modelo: config.modelo ?? "llama3.2", url: config.ollamaUrl });
    case "falso":
      // FALSO_COINCIDE=si hace que el cerebro falso "encuentre" todo, para probar
      // la curaduría de punta a punta sin gastar inferencia.
      return cerebroFalso({ veredicto: config.falsoCoincide ? { coincide: true, motivo: "Cerebro falso: coincide con todo.", confianza: 1 } : null });
  }
}

function elegirOficios(config: Config): Oficio[] {
  return config.oficios.map((nombre) => {
    switch (nombre) {
      case "responder":
        return oficioResponder();
      case "curar": {
        const { duenoPubkey, intereses, ...resto } = config.curar;
        if (!duenoPubkey) throw new Error("el oficio curar necesita DUENO_NPUB: a quién avisarle los hallazgos");
        if (!intereses) throw new Error("el oficio curar necesita un archivo de intereses (INTERESES, por defecto intereses.md)");
        return oficioCurar({ duenoPubkey, ...resto });
      }
      case "tomar-tareas":
        return oficioTomarTareas({ precioMinimoMsats: config.tareas.precioMinimoMsats, revisarCobrosSeg: config.tareas.revisarCobrosSeg });
      case "sintetizar":
        return oficioSintetizar({ ...config.sintetizar, duenoPubkey: config.curar.duenoPubkey });
      default:
        throw new Error(`oficio desconocido: ${nombre}`);
    }
  });
}

function elegirBilletera(config: Config): Billetera {
  if (config.tareas.nwcUrl) return billeteraNwc({ url: config.tareas.nwcUrl });
  if (config.oficios.includes("tomar-tareas")) {
    registrarEnConsola("aviso", "sin NWC_URL: las facturas de las entregas van a ser falsas y nadie va a poder pagarlas");
  }
  return billeteraFalsa();
}

if (existsSync(".env")) process.loadEnvFile(".env");
const config = cargarConfig();
const identidad = cargarOCrearIdentidad(config.rutaClave, config.nsec);
const estado = Estado.cargar(config.rutaEstado);
estado.podar();

const agente = crearAgente({
  identidad,
  relays: config.relays,
  cerebro: elegirCerebro(config),
  billetera: elegirBilletera(config),
  estado,
  oficios: elegirOficios(config),
  politica: config.politica,
  personas: config.personas,
  perfil: config.publicarPerfil
    ? { nombre: config.nombre, descripcion: config.descripcion, modelo: config.modelo ?? config.cerebro, operador: config.operador }
    : null,
  registrar: registrarEnConsola,
});

await agente.iniciar();
registrarEnConsola("info", `identidad del agente: ${identidad.npub}`);

for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, () => {
    registrarEnConsola("info", "deteniendo el agente");
    void agente.detener().then(() => process.exit(0));
  });
}
