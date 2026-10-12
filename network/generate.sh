#!/usr/bin/env bash
# À exécuter UNE SEULE FOIS, par UNE personne. Génère genesis.json + 4 clés de validateurs.
# Ensuite, partagez le dossier network/generated/ (chaque personne ne garde que son nodeN/ + genesis.json).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf generated raw
docker run --rm -v "$PWD":/w hyperledger/besu:latest operator generate-blockchain-config \
  --config-file=/w/qbftConfigFile.json --to=/w/raw --private-key-file-name=key
mkdir -p generated
cp raw/genesis.json generated/genesis.json
i=1
for d in raw/keys/*/; do
  mkdir -p "generated/node$i"
  cp "$d/key" "generated/node$i/key"
  cp "$d/key.pub" "generated/node$i/key.pub"
  echo "node$i -> validateur $(basename "$d")"
  i=$((i+1))
done
rm -rf raw
echo "OK. Clés PRIVÉES dans generated/ : ne pas commiter (déjà dans .gitignore)."
