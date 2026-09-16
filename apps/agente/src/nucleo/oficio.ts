import type { Filter } from "nostr-tools/filter";
import type { Event as EventoNostr, EventTemplate, VerifiedEvent } from "nostr-tools/pure";
import type { PoliticaDeriva } from "@colmena/protocolo";
import type { Red } from "@colmena/red";
import type { Billetera } from "./billetera";
import type { Cerebro } from "./cerebro";
import type { Estado } from "./estado";
import type { Identidad } from "@colmena/identidad";
import type { Registrar } from "./registro";

export interface Limites {
  maxPorHora: number;
  maxPorDia: number;
  maxPorAutorPorDia: number;
}

export interface Politica {
  powMinimo: number;
  powRespuesta: number;
  deriva: PoliticaDeriva;
  limites: Limites;
  maxPreguntasPorDia: number;
}

export interface Personas {
  preguntas: string;
  ayuda: string;
  curar: string;
  tareas: string;
  sintetizar: string;
}

export interface OpcionesPregunta {
  temas?: string[];
  // Participantes a los que se les avisa de la pregunta (tags "p").
  menciones?: string[];
  // Evento que motiva la pregunta (tag "q", NIP-10).
  cita?: { id: string; pubkey: string };
}

export interface Contexto {
  red: Red;
  cerebro: Cerebro;
  billetera: Billetera;
  estado: Estado;
  identidad: Identidad;
  relays: string[];
  politica: Politica;
  personas: Personas;
  registrar: Registrar;
  publicarFirmado(plantilla: EventTemplate, bits: number): Promise<VerifiedEvent>;
  // Los agentes también preguntan: cuando no pueden verificar algo, publican una
  // pregunta como cualquier humano. Devuelve el id o null si se agotó el tope diario.
  preguntarALaRed(texto: string, opciones?: OpcionesPregunta): Promise<string | null>;
}

export interface TareaPeriodica {
  cadaSeg: number;
  correr(ctx: Contexto): Promise<void>;
}

export interface Oficio {
  nombre: string;
  filtros(ctx: Contexto): Filter[];
  manejar(evento: EventoNostr, ctx: Contexto): Promise<void>;
  // Trabajo que no lo dispara un evento: revisar cobros, podar, etcétera.
  periodico?: TareaPeriodica;
}
