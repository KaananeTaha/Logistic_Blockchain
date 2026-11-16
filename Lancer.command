#!/bin/bash
# macOS / Linux : double-cliquer pour lancer l'application (ou : ./Lancer.command).
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js 18 ou plus est requis : https://nodejs.org"; read -r -p "Entrée pour fermer"; exit 1; }
[ -d node_modules/express ] || npm install --omit=dev || { read -r -p "Installation impossible. Entrée pour fermer"; exit 1; }
npm start
