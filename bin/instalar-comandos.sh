#!/bin/bash
# Deja `anotar` y `colmena` disponibles desde cualquier carpeta.
#
# Anotar lo que sabés tiene que ser fácil desde donde estés parado. Si hay que
# acordarse de entrar primero a una carpeta, se anota menos, y lo que no se anota
# se pierde.

set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$HOME/.local/bin"
NODE_BIN="$(dirname "$(command -v node)")"

mkdir -p "$DESTINO"

cat > "$DESTINO/anotar" <<ANOTAR
#!/bin/bash
# Deja escrito lo que sabés, firmado con tu clave, en la colmena.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/anotar.mjs" "\$@"
ANOTAR

cat > "$DESTINO/colmena" <<COLMENA
#!/bin/bash
# Levanta la colmena. --puente la abre al mundo por un rato.
export PATH="$NODE_BIN:\$PATH"
cd "$RAIZ"
exec node "$RAIZ/bin/colmena.mjs" "\$@"
COLMENA

chmod +x "$DESTINO/anotar" "$DESTINO/colmena"
echo "Listos, desde cualquier carpeta:"
echo "  anotar \"lo que sepas\""
echo "  anotar --temas nostr,relays \"lo que sepas\""
echo "  colmena --puente"
