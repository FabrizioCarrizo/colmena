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

export const CONTENIDO_ACEPTACION = "✅";
