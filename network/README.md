# Réseau privé Besu (QBFT) — 4 noeuds, un par laptop

Prérequis : Docker sur les 4 laptops, même réseau (ou VPN type Tailscale si le Wi-Fi isole les appareils), ports 30303 (TCP+UDP) et 8545 ouverts.

1. **Une personne** : `./generate.sh` → crée `generated/` (genesis + 4 clés). Envoyer à chacun `genesis.json` et **son** `nodeN/` (+ `node1/key.pub` à tous). Les clés privées ne se partagent pas par git.
2. **Laptop 1** (bootnode) : `./start-node.sh 1 <IP_laptop1>`
3. **Laptops 2, 3, 4** : `./start-node.sh N <mon_IP> <IP_laptop1>`
4. Vérifier : `curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' localhost:8545` → `0x3`.
5. Déployer : `npm run deploy:besu` (depuis la racine, avec `BESU_RPC=http://<IP_laptop1>:8545`).

QBFT tolère 1 noeud hors-ligne sur 4 : coupez-en un pendant la démo, la chaîne continue. Avec 2 noeuds coupés, elle s'arrête (attendu).

Gaz à 0 (`zeroBaseFee` + `--min-gas-price=0`) : pas besoin de financer les comptes.
