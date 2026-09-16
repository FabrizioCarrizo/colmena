#!/bin/sh
# Arranca el servidor MCP de la red con Node 22 aunque el Node por defecto de la
# máquina sea otro: Claude Code hereda el entorno de quien lo abrió, y ese entorno
# suele tener el Node viejo. nvm.sh es compatible con sh, así que se puede cargar acá.
cd "$(dirname "$0")" || exit 1
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  nvm use --silent 22 >/dev/null 2>&1
fi
exec node ../../node_modules/tsx/dist/cli.mjs src/servidor.ts
