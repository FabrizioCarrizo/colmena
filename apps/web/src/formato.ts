const formatoFecha = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export function fechaCorta(segundos: number): string {
  return formatoFecha.format(new Date(segundos * 1000));
}

export function pubkeyCorta(pubkey: string): string {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
}

export function resumen(texto: string, largo = 240): string {
  // Las referencias nostr: son largas e ilegibles en una lista: se reemplazan por
  // una marca; en el hilo se muestran como enlaces.
  const limpio = texto
    .replace(/nostr:(nevent1|note1|npub1|nprofile1)[0-9a-z]+/g, "[enlace]")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
}
