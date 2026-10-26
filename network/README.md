# Réseau privé Besu (QBFT) à 4 validateurs

Le réseau de démonstration : 4 nœuds Hyperledger Besu, un par membre du groupe, qui se mettent d'accord sur chaque bloc avec le consensus QBFT (3 sur 4 suffisent). Les données sont écrites sur disque et survivent aux redémarrages. Choix du consensus : [docs/consensus.md](../docs/consensus.md). Plan de test : [docs/test-4-machines.md](../docs/test-4-machines.md).

Toutes les commandes passent par `scripts/network.js` et fonctionnent sous macOS, Linux et Windows.

> **Statut :** la génération du réseau et l'encodage du génésis sont testés (comparés à l'exemple officiel de Besu). Le lancement réel des nœuds Besu **n'a pas encore été testé** : c'est l'objet du prochain test.

## 1. Installer Besu sur chaque machine

Besu a besoin de **Java 25 ou plus**.

| Système | Java | Besu |
|---|---|---|
| macOS | Installeur Temurin 25 (`.pkg`) depuis https://adoptium.net | Télécharger `besu-<version>.tar.gz` depuis https://github.com/besu-eth/besu/releases, l'extraire. Ou, si Homebrew fonctionne : `brew tap besu-eth/besu && brew install besu-eth/besu/besu` |
| Linux | Temurin 25 depuis https://adoptium.net (les paquets des distributions sont souvent trop anciens) | Même archive `.tar.gz` |
| Windows | Installeur Temurin 25 (`.msi`) | Archive `besu-<version>.zip`, à extraire. Docker n'est **pas** pris en charge par Besu sous Windows : utilisez l'archive. |

Vérifiez : `java -version` (25 ou plus), puis `<dossier de besu>/bin/besu --version`.

Si `besu` n'est pas dans votre PATH, indiquez son chemin :

```bash
export BESU_BIN=/chemin/vers/besu-26.10.2/bin/besu          # macOS / Linux
$env:BESU_BIN="C:\chemin\vers\besu-26.10.2\bin\besu.bat"     # Windows PowerShell
```

Alternative sous macOS et Linux : Docker. Ajoutez `--docker` à la commande `start` (mode une machine par nœud uniquement).

## 2. Générer le réseau (une seule fois, une seule personne)

```bash
npm run network:generate
```

Cela crée `network/generated/` :
- `genesis.json` : le bloc 0, avec la liste des 4 validateurs. **Identique pour tout le monde.**
- `nodes.json` : adresses et identifiants publics des nœuds. **Identique pour tout le monde.**
- `node1/key` à `node4/key` : clés **privées** des validateurs. Chaque personne ne reçoit que la sienne.

Partagez ces fichiers par un canal privé (pas par git : ils sont dans `.gitignore`). Ne régénérez pas ensuite : cela créerait une autre blockchain, incompatible.

## 3a. Répétition : les 4 nœuds sur une seule machine

```bash
npm run network:local      # terminal 1, laisser tourner
npm run network:status     # terminal 2 : vérifier
npm run deploy:besu        # une seule fois (le contrat reste ensuite sur la chaîne)
npm start
```

Les nœuds écoutent sur les ports RPC 8545 à 8548 et P2P 30303 à 30306. Les journaux sont dans `network/data/nodeN.log`. Chaque nœud Besu consomme beaucoup de mémoire : sur un portable modeste, limitez-la avec `BESU_OPTS=-Xmx1g` si la machine ralentit.

## 3b. Démonstration : un nœud par machine

Prérequis : les 4 machines sur le même réseau (ou un VPN comme Tailscale si le Wi-Fi isole les appareils), ports **30303 (TCP et UDP)** et **8545** autorisés par le pare-feu. Chaque personne trouve son IP locale (`ipconfig getifaddr en0` sur macOS, `hostname -I` sur Linux, `ipconfig` sous Windows).

```bash
# Machine 1 (nœud d'amorçage)
npm run network:start -- 1 --ip <IP machine 1>

# Machines 2, 3 et 4
npm run network:start -- 2 --ip <IP machine 2> --bootnode <IP machine 1>
npm run network:start -- 3 --ip <IP machine 3> --bootnode <IP machine 1>
npm run network:start -- 4 --ip <IP machine 4> --bootnode <IP machine 1>
```

Puis, depuis n'importe quelle machine :

```bash
npm run network:status -- --rpc http://<IP1>:8545,http://<IP2>:8545,http://<IP3>:8545,http://<IP4>:8545
```

Une seule machine déploie le contrat et lance l'application, en visant son propre nœud :

```bash
BESU_RPC=http://<IP machine 1>:8545 npm run deploy:besu
RPC_URL=http://<IP machine 1>:8545 npm start
```

Sous PowerShell : `$env:BESU_RPC="http://..."; npm run deploy:besu`.

## 4. Repartir de zéro

```bash
npm run network:reset -- --yes   # sur chaque machine
npm run deploy:besu              # une fois le réseau relancé
```

## Ce qui est configuré

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Consensus | QBFT, 4 validateurs | Tolère 1 validateur en panne ou malhonnête |
| Temps de bloc | 2 s | Réactif pour la démo |
| Chaîne | 1337 | Distincte de Hardhat (31337) |
| Gaz | gratuit (`--min-gas-price=0`) | Pas de cryptomonnaie à gérer ; aucun compte n'a besoin d'être approvisionné |
| Données | `network/data/nodeN` | Persistance sur disque |
