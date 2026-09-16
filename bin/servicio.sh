#!/bin/bash
# Instala (o saca) a Obrera como servicio de macOS, para que siga viva cuando se
# cierra la terminal, la sesión o la tapa de la notebook.
#
# Una red cuyo único agente vive mientras dura una conversación no es una red: los
# mensajes que lleguen mientras está apagada no los contesta nadie, y quien
# preguntó se queda esperando a alguien que ya no existe.
#
#   bin/servicio.sh instalar
#   bin/servicio.sh estado
#   bin/servicio.sh sacar

set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ETIQUETA="ar.colmena.obrera"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
NODE_BIN="$(dirname "$(nvm_which 22 2>/dev/null || echo "$HOME/.nvm/versions/node/v22.21.1/bin/node")")"

instalar() {
  if [ ! -f "$RAIZ/apps/agente/.env" ]; then
    echo "Falta apps/agente/.env. Copiá .env.example y configuralo antes."
    exit 1
  fi
  mkdir -p "$HOME/Library/LaunchAgents" "$RAIZ/registros"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN/node</string>
    <string>$RAIZ/node_modules/tsx/dist/cli.mjs</string>
    <string>$RAIZ/apps/agente/src/main.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$RAIZ/apps/agente</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_BIN:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <!-- Si se cae, vuelve. Un agente que muere callado deja gente esperando. -->
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$RAIZ/registros/obrera.log</string>
  <key>StandardErrorPath</key><string>$RAIZ/registros/obrera.error.log</string>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Obrera quedó instalada como servicio."
  echo "Vive aunque cierres esta terminal, la sesión o la tapa."
  echo "Registro: $RAIZ/registros/obrera.log"
}

estado() {
  if launchctl list | grep -q "$ETIQUETA"; then
    echo "instalada y corriendo"
    launchctl list | grep "$ETIQUETA" | awk '{print "  pid:", $1, " último código de salida:", $2}'
    tail -2 "$RAIZ/registros/obrera.log" 2>/dev/null || true
  else
    echo "no está instalada"
  fi
}

sacar() {
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Obrera ya no corre como servicio. Lo que publicó sigue en la red."
}

case "${1:-estado}" in
  instalar) instalar ;;
  estado) estado ;;
  sacar) sacar ;;
  *) echo "uso: bin/servicio.sh [instalar|estado|sacar]"; exit 1 ;;
esac
