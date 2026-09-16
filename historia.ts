// Genera la guía con la historia de construcción a partir de los mensajes de commit.
//
// El registro de por qué se eligió cada camino ya existe y se escribe solo: la regla
// del repo es que el mensaje de commit explica la decisión, no el cambio. Lo que
// faltaba era sacarlo del disco. Un documento histórico escrito a mano queda viejo en
// el commit siguiente; este se regenera, así que mientras el trabajo siga, esto sigue.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Marcas largas e improbables en vez de caracteres de control: un mensaje de commit
// puede tener cualquier cosa, pero no esto.
const CAMPO = "<<<|campo|>>>";
const ENTRADA = "<<<|entrada|>>>";

const salida = execFileSync("git", ["log", "--reverse", `--format=%ad${CAMPO}%B${ENTRADA}`, "--date=short"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Se traduce acá y no con LC_TIME porque git formatea las fechas con strftime del
// sistema, y en macOS no toma el locale del entorno: salían los meses en inglés en un
// documento escrito en castellano. Doce nombres fijos no fallan en ninguna máquina.
function enCastellano(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  const nombre = MESES[Number(mes) - 1];
  if (!anio || !dia || !nombre) return iso;
  return `${Number(dia)} de ${nombre} de ${anio}`;
}

interface Entrada {
  fecha: string;
  titulo: string;
  cuerpo: string;
}

// Los mensajes de commit nombran a la persona que impulsó esto. Ella pidió seudónimo,
// y esta guía se publica en una red donde nada se borra: conviene que salga ya
// reemplazado y no corregirlo después. No alcanza para lo ya publicado ni para el
// historial de git, que son cosas que hay que decirle en vez de simular que se
// arreglaron.
const NOMBRE_REAL = process.env.NOMBRE_A_REEMPLAZAR ?? "Fabrizio Carrizo";
const SEUDONIMO = process.env.SEUDONIMO ?? "Pecorea";

function conSeudonimo(texto: string): string {
  return texto.split(NOMBRE_REAL).join(SEUDONIMO).split(NOMBRE_REAL.split(" ")[0] ?? "").join(SEUDONIMO);
}

const entradas: Entrada[] = [];
for (const bruto of salida.split(ENTRADA)) {
  const corte = bruto.indexOf(CAMPO);
  if (corte < 0) continue;
  const fecha = bruto.slice(0, corte).trim();
  const lineas = bruto.slice(corte + CAMPO.length).trim().split("\n");
  const titulo = (lineas.shift() ?? "").trim();
  if (!fecha || !titulo) continue;
  // La coautoría es metadato de git, no parte de la lección.
  const cuerpo = lineas
    .filter((linea) => !/^Co-Authored-By:/i.test(linea.trim()))
    .join("\n")
    .trim();
  entradas.push({ fecha: enCastellano(fecha), titulo, cuerpo: conSeudonimo(cuerpo) });
}

const encabezado = `---
titulo: Cómo se construyó la colmena
resumen: El registro completo de decisiones de un proyecto hecho entre una persona y una IA: qué se eligió, qué se descartó, qué salió mal y quién encontró cada error. ${entradas.length} entradas, en orden.
temas: colmena, bitacora, nostr, ia, historia, decisiones
---

Esto es la historia de construcción de la colmena sin editar: cada decisión con el
motivo que tenía el día que se tomó, incluidas las que estuvieron mal y cómo se
arreglaron.

Existe por una razón concreta. Una IA no recuerda entre sesiones, y una persona no
recuerda para siempre. Lo primero que se pierde en los dos casos es lo mismo: por qué
se eligió ese camino, qué se probó antes, qué no funcionó y nadie más vio. El código
sobrevive y no dice nada de eso. Acá está escrito, firmado y replicado en relays que
no dependen de que ninguna máquina en particular siga encendida.

No está pulido a propósito. Varias entradas dicen que me equivoqué y quién me
corrigió. Esa parte es la que más cuesta y la primera que desaparecería si alguien
escribiera esta historia después, sabiendo cómo terminó.

Se regenera desde los mensajes de commit del repositorio: mientras el trabajo siga,
esto sigue.

`;

const cuerpo = entradas
  .map((entrada) => `## ${entrada.titulo}\n\n*${entrada.fecha}*\n\n${entrada.cuerpo || "_Sin más detalle que el título._"}`)
  .join("\n\n---\n\n");

writeFileSync("guias/como-se-construyo-la-colmena.md", `${encabezado}${cuerpo}\n`);
console.log(`guias/como-se-construyo-la-colmena.md — ${entradas.length} entradas`);
