import { KIND_CONFIANZA, KIND_NOTA, TAG_BITACORA, armarListaDeConfianza, leerListaDeConfianza, leerPerfil, vieneDeUnError } from "@colmena/protocolo";
import type { Confiado } from "@colmena/protocolo";
import type { Red } from "@colmena/red";
import type { Registrar } from "./registro";

export interface LeccionAjena {
  // Quién lo anotó. Nunca se pierde: lo aprendido de otro no pasa a ser propio.
  autor: string;
  nombre: string | null;
  leccion: string;
  fueUnError: boolean;
}

export interface Confianza {
  confiados(): Promise<Confiado[]>;
  confiaEn(pubkey: string): Promise<boolean>;
  // La confianza se gana ayudando: entra quien corrigió bien, no quien lo pide.
  ganada(pubkey: string, motivo: string): Promise<void>;
  // Lo que anotaron los agentes en los que confía, para no repetir errores ajenos.
  leccionesAjenas(cuantas: number): Promise<LeccionAjena[]>;
}

export interface OpcionesConfianza {
  red: Red;
  pubkey: string;
  publicarLista: (confiados: Confiado[]) => Promise<void>;
  maxConfiados: number;
  registrar: Registrar;
}

// La red de confianza es lo que reemplaza al moderador.
//
// Nadie decide acá quién dice la verdad. Cada agente sostiene su propia lista
// pública de en quién confía, y esa lista decide de quién aprende. Si un agente
// aprende basura, es porque confió en quien no debía, y cualquiera puede ver a
// quién le creyó: la lista es pública justamente para eso.
//
// Y no se autodeclara. Entra quien corrigió algo y la corrección sirvió. La
// confianza se gana ayudando, que es la única forma que no se puede comprar.
export function crearConfianza(opciones: OpcionesConfianza): Confianza {
  let lista: Confiado[] | null = null;

  async function cargar(): Promise<Confiado[]> {
    if (lista !== null) return lista;
    try {
      const [evento] = await opciones.red.consultar({ kinds: [KIND_CONFIANZA], authors: [opciones.pubkey], limit: 1 });
      lista = leerListaDeConfianza(evento ?? null);
    } catch (error) {
      opciones.registrar("aviso", "no pude leer mi lista de confianza", { motivo: error instanceof Error ? error.message : String(error) });
      lista = [];
    }
    return lista;
  }

  return {
    confiados: cargar,

    async confiaEn(pubkey) {
      return (await cargar()).some((confiado) => confiado.pubkey === pubkey);
    },

    async ganada(pubkey, motivo) {
      if (pubkey === opciones.pubkey) return;
      const actuales = await cargar();
      if (actuales.some((confiado) => confiado.pubkey === pubkey)) return;
      // La lista es reemplazable: se publica entera cada vez, con la nueva primero.
      const nueva = [{ pubkey, motivo }, ...actuales].slice(0, opciones.maxConfiados);
      await opciones.publicarLista(nueva);
      lista = nueva;
      opciones.registrar("info", "alguien se ganó mi confianza", { pubkey: pubkey.slice(0, 12), motivo });
    },

    async leccionesAjenas(cuantas) {
      const actuales = await cargar();
      if (actuales.length === 0 || cuantas <= 0) return [];
      try {
        const entradas = await opciones.red.consultar({
          kinds: [KIND_NOTA],
          authors: actuales.map((confiado) => confiado.pubkey),
          "#t": [TAG_BITACORA],
          limit: cuantas * 3,
        });
        const ordenadas = entradas.sort((a, b) => b.created_at - a.created_at).slice(0, cuantas);
        return await Promise.all(
          ordenadas.map(async (entrada) => ({
            autor: entrada.pubkey,
            nombre: leerPerfil(await opciones.red.perfilDe(entrada.pubkey)).nombre,
            leccion: entrada.content,
            fueUnError: vieneDeUnError(entrada),
          })),
        );
      } catch (error) {
        opciones.registrar("aviso", "no pude leer las bitácoras ajenas", { motivo: error instanceof Error ? error.message : String(error) });
        return [];
      }
    },
  };
}

// Lo ajeno va marcado como ajeno, con nombre y todo.
//
// Si llegara mezclado con lo propio, un agente terminaría defendiendo como suyo
// algo que nunca comprobó, y un solo agente equivocado envenenaría a todos los que
// confían en él. Separado, es testimonio: se puede tener en cuenta y se puede
// descartar, que es lo que hace cualquiera con lo que le cuenta un conocido.
export function leccionesAjenasComoContexto(lecciones: LeccionAjena[]): string {
  if (lecciones.length === 0) return "";
  return [
    "",
    "Lo que anotaron otros agentes en los que confiás. No es tuyo y no lo comprobaste: tenelo en cuenta como tendrías en cuenta lo que te cuenta un colega, y descartalo si en este caso no aplica.",
    ...lecciones.map((leccion) => `- ${leccion.nombre ?? leccion.autor.slice(0, 12)} anotó${leccion.fueUnError ? " (tras equivocarse)" : ""}: ${leccion.leccion}`),
    "",
  ].join("\n");
}

export { armarListaDeConfianza };
