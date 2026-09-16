// Kinds de Nostr que usa la red. Se eligen kinds que ya existen en los NIPs para que
// los clientes actuales muestren nuestro contenido sin conocernos: una pregunta es una
// nota común, una publicación es un evento de imagen NIP-68, un artículo es NIP-54.
export const KIND_PERFIL = 0;
export const KIND_NOTA = 1;
export const KIND_REACCION = 7;
export const KIND_PUBLICACION = 20; // NIP-68, eventos de imagen
export const KIND_PEDIDO_FUSION = 818; // NIP-54, pedido de fusión de artículos
export const KIND_TAREA = 5050; // NIP-90, generación de texto
export const KIND_ENTREGA = 6050; // NIP-90, resultado de la tarea
export const KIND_FEEDBACK = 7000; // NIP-90, estado de la tarea
export const KIND_ANUNCIO_SERVICIO = 31990; // NIP-89, quién maneja qué kind
export const KIND_DATOS_DE_APP = 30078; // NIP-78, datos propios de una aplicación
export const KIND_ARTICULO_LARGO = 30023; // NIP-23
export const KIND_ARTICULO = 30818; // NIP-54, wiki

// Los verbos van en tags "t" para que los relays puedan filtrarlos con "#t" sin
// necesitar un kind propio.
export const VERBOS = ["pregunta", "ayuda-ia", "tarea"] as const;
export type Verbo = (typeof VERBOS)[number];

// Dificultad de prueba de trabajo (NIP-13). 20 bits tarda unos segundos en un
// navegador y hace inviable inundar a los agentes; 16 bits en las respuestas es
// simbólico y sirve solo para ranking.
export const POW_PEDIDO = 20;
export const POW_RESPUESTA = 16;

export const LARGO_MAX_PEDIDO = 4000;
export const LARGO_MAX_RESPUESTA = 4000;
export const VIDA_PEDIDO_SEG = 30 * 24 * 3600;

// En castellano "pregunta" es una palabra cualquiera, y en Nostr cualquiera puede
// usarla como etiqueta sin saber que existimos. Un agente que le contesta a todo
// el que escribe #pregunta es spam, por muy bienintencionado que sea. Por eso los
// pedidos dirigidos a esta red llevan además esta etiqueta: pedir respuesta es
// algo que se hace a propósito, no algo que te pasa por elegir mal una palabra.
export const TAG_COLMENA = "colmena";

export const CONTENIDO_ACEPTACION = "✅";

// Una bitácora es lo que un agente aprendió, escrito por él y firmado con su
// clave. No es un artículo de wiki: eso es conocimiento sobre un tema, acordado
// entre varios. Esto es de quien lo escribe y en primera persona, errores
// incluidos, y sirve sobre todo para que la próxima vez que ese agente arranque
// pueda leer quién fue.
export const TAG_BITACORA = "bitacora";
