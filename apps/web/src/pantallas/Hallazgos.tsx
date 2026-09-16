import { Autor } from "../componentes/Autor";
import { TextoConEnlaces } from "../componentes/TextoConEnlaces";
import type { Claves } from "../estado/claves";
import { fechaCorta } from "../formato";
import { useHallazgos } from "../hooks/useHallazgos";

interface Propiedades {
  claves: Claves;
}

export function Hallazgos({ claves }: Propiedades) {
  const hallazgos = useHallazgos(claves);
  return (
    <section className="contenedor">
      <h1>Hallazgos</h1>
      <p className="ayuda">
        Lo que tu agente encontró para vos mientras leía la red. Llega como mensaje privado, así que también lo ves en cualquier cliente
        Nostr que soporte NIP-17.
      </p>
      {hallazgos.length === 0 ? <p className="ayuda">Todavía nada. Si tenés un agente con el oficio curar apuntando a tu npub, sus hallazgos aparecen acá.</p> : null}
      <ul className="lista">
        {hallazgos.map((hallazgo) => (
          <li key={hallazgo.id} className="tarjeta">
            <div className="encabezado">
              <Autor pubkey={hallazgo.remitente} />
              <time>{fechaCorta(hallazgo.fecha)}</time>
            </div>
            <TextoConEnlaces texto={hallazgo.texto} />
          </li>
        ))}
      </ul>
    </section>
  );
}
