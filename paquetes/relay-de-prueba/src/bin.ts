import { iniciarBlossomDePrueba, iniciarRelayDePrueba } from "./index";

const puertoRelay = Number(process.env.PUERTO ?? 7777);
const puertoBlossom = Number(process.env.PUERTO_BLOSSOM ?? 7778);
const relay = await iniciarRelayDePrueba(puertoRelay);
const blossom = await iniciarBlossomDePrueba(puertoBlossom);
console.log(`relay de prueba escuchando en ${relay.url} (solo desarrollo, no persiste nada)`);
console.log(`servidor Blossom de prueba escuchando en ${blossom.url} (solo desarrollo, no persiste nada)`);

for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, () => {
    void Promise.all([relay.cerrar(), blossom.cerrar()]).then(() => process.exit(0));
  });
}
