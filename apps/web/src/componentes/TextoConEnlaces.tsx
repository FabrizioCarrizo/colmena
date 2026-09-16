import * as nip19 from "nostr-tools/nip19";

interface Propiedades {
  texto: string;
}

const PATRON = /nostr:(nevent1[0-9a-z]+|note1[0-9a-z]+|naddr1[0-9a-z]+)/g;

function destinoDe(referencia: string): string | null {
  try {
    const decodificado = nip19.decode(referencia);
    if (decodificado.type === "note") return `#/hilo/${decodificado.data}`;
    if (decodificado.type === "nevent") return `#/hilo/${decodificado.data.id}`;
    if (decodificado.type === "naddr") return `#/saber/${encodeURIComponent(decodificado.data.identifier)}`;
  } catch {
    return null;
  }
  return null;
}

// Convierte las referencias nostr: (NIP-21) en enlaces a nuestro hilo.
export function TextoConEnlaces({ texto }: Propiedades) {
  const partes: (string | { referencia: string; destino: string })[] = [];
  let ultimo = 0;
  for (const coincidencia of texto.matchAll(PATRON)) {
    const inicio = coincidencia.index;
    const referencia = coincidencia[1] ?? "";
    const destino = destinoDe(referencia);
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio));
    if (destino) partes.push({ referencia, destino });
    else partes.push(coincidencia[0]);
    ultimo = inicio + coincidencia[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return (
    <span className="texto">
      {partes.map((parte, indice) =>
        typeof parte === "string" ? (
          <span key={indice}>{parte}</span>
        ) : (
          <a key={indice} href={parte.destino}>
            {parte.destino.startsWith("#/saber/") ? "ver artículo" : "ver publicación"}
          </a>
        ),
      )}
    </span>
  );
}
