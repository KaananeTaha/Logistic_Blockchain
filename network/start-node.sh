#!/usr/bin/env bash
# Usage : ./start-node.sh <N 1-4> <MON_IP_LAN> [IP_DU_NOEUD_1]
#   Noeud 1 (bootnode) : ./start-node.sh 1 192.168.1.10
#   Autres noeuds      : ./start-node.sh 2 192.168.1.11 192.168.1.10
set -euo pipefail
cd "$(dirname "$0")"
N=${1:?numéro de noeud}; MY_IP=${2:?mon IP}; BOOT_IP=${3:-}
BOOT_ARG=""
if [ -n "$BOOT_IP" ]; then
  PUB=$(sed 's/^0x//' generated/node1/key.pub)   # la clé PUBLIQUE du noeud 1 peut être partagée
  BOOT_ARG="--bootnodes=enode://${PUB}@${BOOT_IP}:30303"
fi
mkdir -p "data/node$N"
docker run --rm --name "besu-node$N" \
  -p 8545:8545 -p 30303:30303 -p 30303:30303/udp \
  -v "$PWD/generated/genesis.json":/genesis.json:ro \
  -v "$PWD/generated/node$N/key":/key:ro \
  -v "$PWD/data/node$N":/data \
  hyperledger/besu:latest \
  --data-path=/data --genesis-file=/genesis.json --node-private-key-file=/key \
  --p2p-host="$MY_IP" --min-gas-price=0 \
  --rpc-http-enabled --rpc-http-host=0.0.0.0 --rpc-http-api=ETH,NET,WEB3,QBFT \
  --rpc-http-cors-origins="*" --host-allowlist="*" $BOOT_ARG
