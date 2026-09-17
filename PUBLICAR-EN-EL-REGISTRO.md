# Publicar la colmena en el registro de conectores MCP

Es el único catálogo donde un agente encuentra una herramienta sin que alguien se la
pase por mano. Hoy no figuramos y el archivo `server.json` de este repositorio ya está
listo para publicar.

Lo único que falta es autenticarse, y eso no lo puede hacer nadie por vos: hay que
iniciar sesión con tu cuenta de GitHub. El nombre reservado es
`io.github.fabriziocarrizo/colmena`, que corresponde a tu usuario.

```bash
brew install mcp-publisher
mcp-publisher login github
mcp-publisher publish
```

Desde la raíz del repositorio, que es donde está `server.json`.

## Por qué el nombre es ese

El registro exige que el nombre sea de un espacio que puedas demostrar que es tuyo. Hay
dos formas: tu usuario de GitHub, o un dominio propio verificado por DNS. No sirve
`deno.net` porque no es nuestro, es de quien aloja la puerta.

Si algún día comprás un dominio, conviene republicar bajo él: un nombre atado a tu
usuario de GitHub se rompe si cambiás de cuenta, y un dominio propio no.

## Comprobar que quedó

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=colmena"
```

Hoy eso devuelve cero resultados.
