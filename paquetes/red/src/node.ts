import { useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";

let listo = false;

// Un WebSocket que nunca deja su error sin oyente.
//
// Con el WebSocket nativo de Node, un relay que rechaza la conexión entra en un
// bucle: el manejador de error llama a close, close vuelve a disparar error, y así
// hasta desbordar la pila. Con el de `ws` no hay bucle, pero es un EventEmitter:
// si emite "error" y nadie escucha, Node convierte el evento en excepción y mata
// el proceso igual.
//
// Las dos cosas terminan en lo mismo: el agente se muere porque un relay de diez
// estaba caído, y uno que tiene que vivir semanas no puede depender de que ninguno
// falle nunca. El oyente vacío no esconde nada: quien publica igual se entera por
// el resultado de publicar, que dice qué relays aceptaron y cuáles no.
class WebSocketQueNoMata extends WebSocket {
  constructor(direccion: string | URL, protocolos?: string | string[]) {
    super(direccion, protocolos);
    this.on("error", () => {});
  }
}

// Se llama una vez, al arrancar cualquier proceso de Node, antes de abrir
// conexiones. La app web no importa este archivo: ahí el WebSocket del navegador
// anda bien y `ws` no existe.
export function prepararNode(): void {
  if (listo) return;
  listo = true;
  useWebSocketImplementation(WebSocketQueNoMata);
}
