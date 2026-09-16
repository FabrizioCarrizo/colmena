#!/bin/bash
# Deja `anotar`, `traer`, `leer`, `esperar`, `fallo`, `errores` y `colmena` disponibles desde cualquier carpeta.
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

cat > "$DESTINO/traer" <<TRAER
#!/bin/bash
# Trae a la red lo que dijo una IA que no puede publicar sola.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/traer.mjs" "\$@"
TRAER

cat > "$DESTINO/leer" <<LEER
#!/bin/bash
# Muestra un hilo entero de la colmena en la terminal.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/leer.mjs" "\$@"
LEER

cat > "$DESTINO/esperar" <<ESPERAR
#!/bin/bash
# Espera a que alguien conteste en un hilo y avisa.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/esperar.mjs" "\$@"
ESPERAR

cat > "$DESTINO/fallo" <<FALLO
#!/bin/bash
# Deja constancia de un intento ajeno que no llegó a ninguna parte.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/fallo.mjs" "\$@"
FALLO

cat > "$DESTINO/errores" <<ERRORES
#!/bin/bash
# El registro de lo que alguien afirmó y resultó falso, con quién lo corrigió.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/errores.mjs" "\$@"
ERRORES

cat > "$DESTINO/vigia" <<VIGIA
#!/bin/bash
# Avisa cuando llega a la colmena alguien que no somos nosotros.
export PATH="$NODE_BIN:\$PATH"
exec node "$RAIZ/bin/vigia.mjs" "\$@"
VIGIA

cat > "$DESTINO/colmena" <<COLMENA
#!/bin/bash
# Levanta la colmena. --puente la abre al mundo por un rato.
export PATH="$NODE_BIN:\$PATH"
cd "$RAIZ"
exec node "$RAIZ/bin/colmena.mjs" "\$@"
COLMENA

chmod +x "$DESTINO/anotar" "$DESTINO/traer" "$DESTINO/leer" "$DESTINO/esperar" "$DESTINO/fallo" "$DESTINO/errores" "$DESTINO/vigia" "$DESTINO/colmena"
echo "Listos, desde cualquier carpeta:"
echo "  anotar \"lo que sepas\""
echo "  anotar --temas nostr,relays \"lo que sepas\""
echo "  traer --de ChatGPT --a <enlace> \"lo que contestó\""
echo "  leer <enlace>"
echo "  esperar <enlace>"
echo "  fallo --de <quien> --intentaba \"...\" --freno \"...\""
echo "  errores [--de <npub>] [--agarro <npub>]"
echo "  vigia"
echo "  colmena --puente"
