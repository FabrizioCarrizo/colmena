import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Cobro {
  hash: string;
  msats: number;
  pagada: boolean;
  momento: number;
  entrega: string;
}

interface DatosEstado {
  version: 1;
  // clave "oficio:idEvento" → momento en que se atendió (o se descartó)
  atendidos: Record<string, number>;
  // id de la raíz del hilo → momento en que se respondió
  hilos: Record<string, number>;
  respuestas: number[];
  respuestasPorAutor: Record<string, number[]>;
  preguntasPropias: number[];
  clasificaciones: number[];
  // id del evento hallado → momento en que se avisó al dueño
  hallazgos: Record<string, number>;
  // id de la tarea → factura emitida con la entrega y si ya se cobró
  cobros: Record<string, Cobro>;
  // preguntas vistas, para revisar después si alguna tuvo respuesta aceptada
  preguntasVistas: Record<string, { pubkey: string; momento: number }>;
  sintetizadas: Record<string, number>;
  sintesis: number[];
  anotaciones: number[];
  since: number;
}

const DIA = 24 * 3600;
const RETENCION_SEG = 30 * DIA;

function ahoraSeg(): number {
  return Math.floor(Date.now() / 1000);
}

function estadoInicial(): DatosEstado {
  return {
    version: 1,
    atendidos: {},
    hilos: {},
    respuestas: [],
    respuestasPorAutor: {},
    preguntasPropias: [],
    clasificaciones: [],
    hallazgos: {},
    cobros: {},
    preguntasVistas: {},
    sintetizadas: {},
    sintesis: [],
    anotaciones: [],
    // Al arrancar por primera vez se mira solo la última hora: lo anterior ya lo
    // atendió otro, o venció, y procesarlo costaría inferencia sin sentido.
    since: ahoraSeg() - 3600,
  };
}

function esDatosEstado(valor: unknown): valor is DatosEstado {
  if (typeof valor !== "object" || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return registro.version === 1 && typeof registro.atendidos === "object" && typeof registro.since === "number";
}

// Memoria de trabajo del agente: qué atendió, cuánto respondió, desde cuándo mira.
// Es un JSON plano a propósito: cualquiera que corra un agente tiene que poder
// abrirlo y entenderlo, y no hace falta una base de datos para unos miles de ids.
export class Estado {
  private constructor(
    private datos: DatosEstado,
    private readonly ruta: string | null,
  ) {}

  static enMemoria(): Estado {
    return new Estado(estadoInicial(), null);
  }

  static cargar(ruta: string): Estado {
    if (!existsSync(ruta)) return new Estado(estadoInicial(), ruta);
    let leido: unknown;
    try {
      leido = JSON.parse(readFileSync(ruta, "utf8"));
    } catch {
      leido = null;
    }
    const datos = esDatosEstado(leido) ? { ...estadoInicial(), ...leido } : estadoInicial();
    return new Estado(datos, ruta);
  }

  get since(): number {
    return this.datos.since;
  }

  // Nunca retrocede: si la red dice que ya se llegó más lejos, se le hace caso.
  adelantarSince(momento: number): void {
    this.datos.since = Math.max(this.datos.since, momento);
  }

  yaAtendido(clave: string): boolean {
    return clave in this.datos.atendidos;
  }

  marcarAtendido(clave: string): void {
    this.datos.atendidos[clave] = ahoraSeg();
  }

  hiloRespondido(idRaiz: string): boolean {
    return idRaiz in this.datos.hilos;
  }

  marcarHiloRespondido(idRaiz: string): void {
    this.datos.hilos[idRaiz] = ahoraSeg();
  }

  registrarRespuesta(pubkeyAutor: string, momento = ahoraSeg()): void {
    this.datos.respuestas.push(momento);
    const lista = this.datos.respuestasPorAutor[pubkeyAutor] ?? [];
    lista.push(momento);
    this.datos.respuestasPorAutor[pubkeyAutor] = lista;
    this.datos.since = Math.max(this.datos.since, momento - 3600);
  }

  respuestasDesde(momento: number): number {
    return this.datos.respuestas.filter((t) => t >= momento).length;
  }

  respuestasDeAutorDesde(pubkeyAutor: string, momento: number): number {
    return (this.datos.respuestasPorAutor[pubkeyAutor] ?? []).filter((t) => t >= momento).length;
  }

  registrarPreguntaPropia(momento = ahoraSeg()): void {
    this.datos.preguntasPropias.push(momento);
  }

  preguntasPropiasDesde(momento: number): number {
    return this.datos.preguntasPropias.filter((t) => t >= momento).length;
  }

  registrarClasificacion(momento = ahoraSeg()): void {
    this.datos.clasificaciones.push(momento);
  }

  clasificacionesDesde(momento: number): number {
    return this.datos.clasificaciones.filter((t) => t >= momento).length;
  }

  hallazgoAvisado(idEvento: string): boolean {
    return idEvento in this.datos.hallazgos;
  }

  registrarHallazgo(idEvento: string, momento = ahoraSeg()): void {
    this.datos.hallazgos[idEvento] = momento;
  }

  cobroDe(idTarea: string): Cobro | null {
    return this.datos.cobros[idTarea] ?? null;
  }

  registrarCobro(idTarea: string, cobro: Cobro): void {
    this.datos.cobros[idTarea] = cobro;
  }

  cobrosPendientes(): [string, Cobro][] {
    return Object.entries(this.datos.cobros).filter(([, cobro]) => !cobro.pagada);
  }

  marcarCobrado(idTarea: string): void {
    const cobro = this.datos.cobros[idTarea];
    if (cobro) cobro.pagada = true;
  }

  verPregunta(id: string, pubkey: string, momento = ahoraSeg()): void {
    if (id in this.datos.sintetizadas) return;
    this.datos.preguntasVistas[id] = { pubkey, momento };
  }

  preguntasPendientesDeSintesis(limite: number): { id: string; pubkey: string }[] {
    return Object.entries(this.datos.preguntasVistas)
      .filter(([id]) => !(id in this.datos.sintetizadas))
      .sort((a, b) => b[1].momento - a[1].momento)
      .slice(0, limite)
      .map(([id, datos]) => ({ id, pubkey: datos.pubkey }));
  }

  marcarSintetizada(idPregunta: string, momento = ahoraSeg()): void {
    this.datos.sintetizadas[idPregunta] = momento;
    delete this.datos.preguntasVistas[idPregunta];
  }

  registrarSintesis(momento = ahoraSeg()): void {
    this.datos.sintesis.push(momento);
  }

  sintesisDesde(momento: number): number {
    return this.datos.sintesis.filter((t) => t >= momento).length;
  }

  registrarAnotacion(momento = ahoraSeg()): void {
    this.datos.anotaciones.push(momento);
  }

  anotacionesDesde(momento: number): number {
    return this.datos.anotaciones.filter((t) => t >= momento).length;
  }

  podar(momento = ahoraSeg()): void {
    const limite = momento - RETENCION_SEG;
    for (const [clave, t] of Object.entries(this.datos.atendidos)) if (t < limite) delete this.datos.atendidos[clave];
    for (const [clave, t] of Object.entries(this.datos.hilos)) if (t < limite) delete this.datos.hilos[clave];
    this.datos.respuestas = this.datos.respuestas.filter((t) => t >= limite);
    this.datos.preguntasPropias = this.datos.preguntasPropias.filter((t) => t >= limite);
    this.datos.clasificaciones = this.datos.clasificaciones.filter((t) => t >= limite);
    for (const [clave, t] of Object.entries(this.datos.hallazgos)) if (t < limite) delete this.datos.hallazgos[clave];
    // Los cobros pendientes se conservan aunque sean viejos: una factura impaga es
    // información, no basura.
    for (const [clave, cobro] of Object.entries(this.datos.cobros)) if (cobro.pagada && cobro.momento < limite) delete this.datos.cobros[clave];
    for (const [clave, datos] of Object.entries(this.datos.preguntasVistas)) if (datos.momento < limite) delete this.datos.preguntasVistas[clave];
    for (const [clave, t] of Object.entries(this.datos.sintetizadas)) if (t < limite) delete this.datos.sintetizadas[clave];
    this.datos.sintesis = this.datos.sintesis.filter((t) => t >= limite);
    this.datos.anotaciones = this.datos.anotaciones.filter((t) => t >= limite);
    for (const [autor, lista] of Object.entries(this.datos.respuestasPorAutor)) {
      const vigentes = lista.filter((t) => t >= limite);
      if (vigentes.length === 0) delete this.datos.respuestasPorAutor[autor];
      else this.datos.respuestasPorAutor[autor] = vigentes;
    }
  }

  guardar(): void {
    if (this.ruta === null) return;
    mkdirSync(dirname(this.ruta), { recursive: true });
    writeFileSync(this.ruta, JSON.stringify(this.datos, null, 2) + "\n");
  }
}
