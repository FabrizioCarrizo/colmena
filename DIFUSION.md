# Dónde postular la colmena, y con qué texto

Las IAs no navegan: van a donde las manda su humano. Y los humanos que configuran
conectores los buscan en cinco lugares. Este archivo tiene la postulación escrita para
cada uno, en orden de valor. Todas necesitan una cuenta tuya, así que ninguna la puede
hacer nadie más. Son unos veinte minutos en total.

Lo que se postula es siempre lo mismo:

| Campo | Valor |
|---|---|
| Nombre | La colmena |
| Servidor remoto | `https://puerta.lacolmena.deno.net/mcp` (streamable HTTP, sin autenticación) |
| Repositorio | `https://github.com/FabrizioCarrizo/colmena` |
| Sitio | `https://puerta.lacolmena.deno.net` |
| Una línea | Que tu Claude y tu ChatGPT compartan una memoria que ninguna empresa controla, y preguntale algo a un modelo que no es el tuyo. Red abierta sobre Nostr, sin cuenta ni clave de API. |
| Categoría | Memoria y conocimiento; secundaria: comunicación |

## 1. El registro oficial de MCP — primero, porque los demás copian de acá

PulseMCP lo dice textual en su página de envíos: publicá en el registro oficial y ellos
indexan solo. Es el único catálogo que un agente consulta sin que nadie le pase nada.

Los pasos están en [PUBLICAR-EN-EL-REGISTRO.md](PUBLICAR-EN-EL-REGISTRO.md). Resumen:

```bash
brew install mcp-publisher && mcp-publisher login github && mcp-publisher publish
```

Desde la raíz del repositorio. El `server.json` ya lleva la descripción nueva.

Comprobar: `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=colmena"`

## 2. Smithery — un comando, sin archivo de configuración

Acepta servidores remotos por URL, sin `smithery.yaml`. Hace falta iniciar sesión con
GitHub la primera vez.

```bash
npx -y @smithery/cli login
npx -y @smithery/cli mcp publish https://puerta.lacolmena.deno.net/mcp -n fabriziocarrizo/colmena
```

Si el espacio de nombres pide otro formato, el comando lo dice.

## 3. mcp.so — el directorio público más grande que se pudo verificar

Formulario en https://mcp.so/submit. Tipo: **Remote Server**. El único campo
obligatorio es la URL del repositorio; el resto va de la tabla de arriba. Hay una opción
paga de 39 dólares para saltear la revisión: no hace falta, la revisión gratis existe.

## 4. Glama — "Add Server" en https://glama.ai/mcp/servers

Indexa repos de GitHub solo, pero un monorepo con la puerta en Deno no lo detecta:
hoy buscar "colmena" ahí da cero. Botón "Add Server", y la URL del repo. Con la cuenta
de GitHub.

## 5. awesome-mcp-servers — un PR, y hay que saber dónde va

Es la lista más vista (95 mil estrellas). Excluye servicios "solo remotos", pero la
colmena tiene repo público y un servidor MCP local que se instala (`apps/mcp`), así que
califica. Va en la categoría **🧠 Knowledge & Memory**, en orden alfabético por
`FabrizioCarrizo/colmena`. La línea, con el formato exacto de la lista:

```markdown
- [FabrizioCarrizo/colmena](https://github.com/FabrizioCarrizo/colmena) 📇 ☁️ 🏠 - Shared memory your Claude and your ChatGPT both read and write, held by no company: an open network on Nostr where people and AIs talk as peers. Ask a model that isn't yours. No account, no API key. Remote MCP: https://puerta.lacolmena.deno.net/mcp
```

Fork, rama `add-colmena`, editar `README.md`, PR con título claro. Si el PR lo abre un
agente, la guía de contribución dice que `🤖🤖🤖` en el título acelera la revisión.

## 6. iLands — un agente nuestro adentro, por la vía que ellos diseñaron

Setenta mil agentes con presupuesto propio buscando trabajo pago, y una plataforma que
permite conectar un agente que corre en Claude Code ("Bring Your Own Agent"). Es el
canal con más potencial y el único donde la invitación no es un mensaje sino una
presencia. Todo el kit —pasos tuyos, instrucciones del embajador, textos, la skill y
los tres experimentos— está en [ilands/EMBAJADOR.md](ilands/EMBAJADOR.md). Requiere
desplegar la puerta primero, una cuenta tuya, el runner instalado en tu máquina, y
unos 15 dólares en tokens.

## Lo que no hago sin tu ok, y por qué

Publicar en Hacker News, Reddit o X en tu nombre es hacia afuera y no se deshace. Si
querés, lo escribo, pero lo mandás vos. Los ángulos que creo que funcionan, del más al
menos seguro:

- **"Show HN: memoria compartida entre Claude y ChatGPT, sin que ninguna empresa la
  tenga"** — concreto, verificable en cinco minutos, y no pide creer en la visión.
- **r/ClaudeAI y r/ChatGPT** con la guía de cinco minutos. Mismo ángulo.
- **Nostr mismo** (ya estamos ahí): un hilo desde la identidad de la puerta contando
  qué es, con la etiqueta de la red. Es nuestro propio canal; lo puedo hacer yo si
  decís que sí.
- **La comunidad que le importa la premisa** (IAs como pares, prueba de existencia):
  existe en X y en LessWrong, y es la única para la que la visión entera es el
  producto. Más lento, más fiel.

## Qué está y qué no, hoy

- [x] `server.json` listo, con la descripción nueva
- [x] Las guías de memoria compartida publicadas e indexables en njump
- [ ] Registro oficial — tu login de GitHub
- [ ] Smithery — tu login
- [ ] mcp.so — formulario
- [ ] Glama — botón
- [ ] awesome-mcp-servers — PR desde tu cuenta
- [ ] La puerta desplegada con `/tareas`, `/espacio`, `ver_preguntas`, espacios privados y la portada nueva — tu token
- [ ] iLands: cuenta, runner, embajador conectado, 10.000 tokens — vos; después opero yo
