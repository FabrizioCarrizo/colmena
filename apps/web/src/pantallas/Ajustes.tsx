import { useState } from "react";
import { BLOSSOM_POR_DEFECTO, RELAYS_POR_DEFECTO, cargarBlossom, cargarNwc, cargarRelays, guardarBlossom, guardarNwc, guardarRelays } from "../estado/ajustes";
import { reemplazarClaves } from "../estado/claves";
import type { Claves } from "../estado/claves";

interface Propiedades {
  claves: Claves;
  alCambiarClaves: (claves: Claves) => void;
}

export function Ajustes({ claves, alCambiarClaves }: Propiedades) {
  const [relays, setRelays] = useState(cargarRelays().join("\n"));
  const [blossom, setBlossom] = useState(cargarBlossom());
  const [nwc, setNwc] = useState(cargarNwc() ?? "");
  const [mostrarSecreta, setMostrarSecreta] = useState(false);
  const [nsecNueva, setNsecNueva] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  function guardar(): void {
    const lista = relays
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => /^wss?:\/\//.test(r));
    guardarRelays(lista.length > 0 ? lista : RELAYS_POR_DEFECTO);
    setRelays((lista.length > 0 ? lista : RELAYS_POR_DEFECTO).join("\n"));
    setMensaje("Relays guardados. Se usan a partir de la próxima pantalla.");
  }

  function importar(): void {
    const nuevas = reemplazarClaves(nsecNueva);
    if (!nuevas) {
      setMensaje("Esa clave no es un nsec válido.");
      return;
    }
    alCambiarClaves(nuevas);
    setNsecNueva("");
    setMensaje("Clave importada. Ahora publicás con esa identidad.");
  }

  return (
    <section className="contenedor">
      <h1>Ajustes</h1>

      <h2>Tu identidad</h2>
      <p className="ayuda">
        Tu identidad es un par de claves. La pública es tu nombre en la red; la privada firma todo lo que publicás y vive solo en este
        navegador. Nadie te la puede restablecer: si la perdés, perdés la identidad.
      </p>
      <p className="mono">{claves.npub}</p>
      <div className="acciones">
        <button type="button" className="boton chico" onClick={() => setMostrarSecreta((v) => !v)}>
          {mostrarSecreta ? "Ocultar clave privada" : "Mostrar clave privada"}
        </button>
      </div>
      {mostrarSecreta ? <p className="mono secreta">{claves.nsec}</p> : null}
      <label className="campo">
        <span>Importar otra clave privada (nsec)</span>
        <input value={nsecNueva} onChange={(e) => setNsecNueva(e.target.value)} placeholder="nsec1…" autoComplete="off" />
      </label>
      <button type="button" className="boton" onClick={importar} disabled={nsecNueva.trim().length === 0}>
        Importar
      </button>

      <h2>Tus relays</h2>
      <p className="ayuda">Uno por línea. Son los lugares donde publicás y de donde leés. Podés agregar el tuyo propio.</p>
      <label className="campo">
        <span>Relays</span>
        <textarea value={relays} onChange={(e) => setRelays(e.target.value)} rows={5} spellCheck={false} />
      </label>
      <button type="button" className="boton" onClick={guardar}>
        Guardar relays
      </button>

      <h2>Tu servidor de archivos</h2>
      <p className="ayuda">
        Las imágenes se suben a un servidor Blossom, direccionadas por su hash. Cualquiera puede correr uno; si el que usás rechaza tu
        subida, probá otro.
      </p>
      <label className="campo">
        <span>Servidor Blossom</span>
        <input value={blossom} onChange={(e) => setBlossom(e.target.value)} placeholder={BLOSSOM_POR_DEFECTO} spellCheck={false} />
      </label>
      <button
        type="button"
        className="boton"
        onClick={() => {
          const limpio = blossom.trim().replace(/\/$/, "");
          guardarBlossom(/^https?:\/\//.test(limpio) ? limpio : BLOSSOM_POR_DEFECTO);
          setBlossom(cargarBlossom());
          setMensaje("Servidor de archivos guardado.");
        }}
      >
        Guardar servidor
      </button>

      <h2>Tu billetera Lightning</h2>
      <p className="ayuda">
        Para pagar tareas desde acá, pegá una conexión Nostr Wallet Connect de tu billetera. Es un secreto que permite gastar: creala
        con un presupuesto acotado y borrala si dejás de usarla. Queda solo en este navegador.
      </p>
      <label className="campo">
        <span>Conexión NWC</span>
        <input value={nwc} onChange={(e) => setNwc(e.target.value)} placeholder="nostr+walletconnect://…" autoComplete="off" spellCheck={false} />
      </label>
      <button
        type="button"
        className="boton"
        onClick={() => {
          const limpio = nwc.trim();
          if (limpio.length > 0 && !limpio.startsWith("nostr+walletconnect://")) {
            setMensaje("La conexión tiene que empezar con nostr+walletconnect://");
            return;
          }
          guardarNwc(limpio.length > 0 ? limpio : null);
          setMensaje(limpio.length > 0 ? "Billetera guardada." : "Billetera borrada.");
        }}
      >
        Guardar billetera
      </button>

      {mensaje ? <p className="aviso">{mensaje}</p> : null}
    </section>
  );
}
