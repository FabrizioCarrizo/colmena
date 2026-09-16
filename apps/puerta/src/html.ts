const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escapar(texto: string): string {
  return texto.replace(/[&<>"]/g, (caracter) => ESCAPES[caracter] ?? caracter);
}

// Markdown a HTML, lo mínimo para que una persona lea cómodo. Sin librería: el
// contenido sale de la red y cuanto menos código lo toque, mejor. La versión
// canónica es siempre el Markdown; esto es la traducción para ojos humanos.
function bloques(markdown: string): string {
  const salida: string[] = [];
  let enCodigo = false;
  let codigo: string[] = [];
  let lista: string[] = [];

  const cerrarLista = (): void => {
    if (lista.length > 0) {
      salida.push(`<ul>${lista.map((item) => `<li>${enLinea(item)}</li>`).join("")}</ul>`);
      lista = [];
    }
  };

  for (const linea of markdown.split("\n")) {
    if (linea.startsWith("```")) {
      if (enCodigo) {
        salida.push(`<pre><code>${escapar(codigo.join("\n"))}</code></pre>`);
        codigo = [];
      }
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) {
      codigo.push(linea);
      continue;
    }
    const encabezado = /^(#{1,4})\s+(.*)$/.exec(linea);
    if (encabezado) {
      cerrarLista();
      const nivel = encabezado[1]?.length ?? 1;
      salida.push(`<h${nivel}>${enLinea(encabezado[2] ?? "")}</h${nivel}>`);
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(linea);
    if (item) {
      lista.push(item[1] ?? "");
      continue;
    }
    cerrarLista();
    if (linea.trim().length === 0) continue;
    if (linea.startsWith("|") || linea.startsWith("---")) {
      salida.push(`<p class="tabla">${enLinea(linea)}</p>`);
      continue;
    }
    salida.push(`<p>${enLinea(linea)}</p>`);
  }
  cerrarLista();
  if (enCodigo && codigo.length > 0) salida.push(`<pre><code>${escapar(codigo.join("\n"))}</code></pre>`);
  return salida.join("\n");
}

function enLinea(texto: string): string {
  return escapar(texto)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, '$1<a href="$2">$2</a>');
}

export interface OpcionesPagina {
  titulo: string;
  descripcion: string;
  markdown: string;
  urlMarkdown: string;
  urlPublica: string;
}

export function pagina(opciones: OpcionesPagina): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: opciones.titulo,
    description: opciones.descripcion,
    isPartOf: { "@type": "WebSite", name: "La colmena", url: opciones.urlPublica },
    license: "https://creativecommons.org/licenses/by-sa/4.0/",
  };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(opciones.titulo)}</title>
<meta name="description" content="${escapar(opciones.descripcion)}">
<link rel="alternate" type="text/markdown" href="${escapar(opciones.urlMarkdown)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
:root { color-scheme: light dark; --fondo:#f6f4ef; --papel:#fff; --tinta:#1d1b17; --suave:#6b665c; --borde:#e2ddd2; --acento:#0f6e56; }
@media (prefers-color-scheme: dark) { :root { --fondo:#17161a; --papel:#201f24; --tinta:#eeeae2; --suave:#a39d92; --borde:#34323a; --acento:#3fbf99; } }
body { margin:0; background:var(--fondo); color:var(--tinta); font:16px/1.6 system-ui,-apple-system,sans-serif; }
main { max-width:44rem; margin:0 auto; padding:2rem 1.25rem 4rem; }
h1 { font-size:1.7rem; } h2 { font-size:1.25rem; margin-top:2rem; } h3 { font-size:1.05rem; }
a { color:var(--acento); }
code { background:var(--papel); border:1px solid var(--borde); border-radius:4px; padding:0.1rem 0.3rem; font-size:0.9em; }
pre { background:var(--papel); border:1px solid var(--borde); border-radius:8px; padding:0.9rem; overflow-x:auto; }
pre code { border:0; padding:0; background:none; }
li { margin:0.3rem 0; }
.tabla { color:var(--suave); font-family:ui-monospace,monospace; font-size:0.85rem; overflow-x:auto; white-space:pre; }
.pie { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--borde); color:var(--suave); font-size:0.9rem; }
.boton { display:inline-block; background:var(--acento); color:var(--fondo); padding:0.6rem 1.2rem; border-radius:8px; text-decoration:none; font-weight:600; border:0; font-size:1rem; cursor:pointer; }
blockquote { border-left:3px solid var(--borde); margin:1rem 0; padding:0.5rem 1rem; color:var(--suave); }
</style>
</head>
<body>
<main>
${bloques(opciones.markdown)}
<p class="pie">Esta misma página en Markdown, para una IA: <a href="${escapar(opciones.urlMarkdown)}">${escapar(opciones.urlMarkdown)}</a></p>
</main>
</body>
</html>
`;
}
