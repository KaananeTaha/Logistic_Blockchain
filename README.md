# Logistic_Blockchain

Blockchain décentralisée pour la traçabilité d'une chaîne logistique .

Un Smart Contract Solidity enregistre les lots, leurs étapes de transport et les mesures des capteurs. Il applique automatiquement les règles (chaîne du froid, délais) et l'historique est consultable via un QR Code. Les données privées restent hors-chaîne : seul leur hash est publié, ce qui permet de détecter toute modification.

Documentation :
- [docs/framework.md](docs/framework.md) : cadrage, choix d'architecture, lien avec le cahier des charges.
- [docs/parcours.md](docs/parcours.md) : chaque étape du parcours et ce qui se passe en coulisses.
- [docs/consensus.md](docs/consensus.md) : pourquoi QBFT, avantages, limites, alternatives écartées.
- [docs/persistance.md](docs/persistance.md) : stockage permanent des données.
- [docs/test-4-machines.md](docs/test-4-machines.md) : plan de test du réseau sur 4 machines.
- [docs/suivi-debrief.md](docs/suivi-debrief.md) : suivi des décisions du dernier debrief.

## Sommaire

1. [Fonctionnement en bref](#fonctionnement-en-bref)
2. [Prérequis et installation](#prérequis-et-installation) (macOS, Windows, Linux)
3. [Lancer la démo](#lancer-la-démo)
4. [Scénario de démonstration](#scénario-de-démonstration)
5. [Structure du dépôt](#structure-du-dépôt)
6. [Commandes utiles](#commandes-utiles)
7. [Dépannage](#dépannage)
8. [Limites du prototype](#limites-du-prototype)
9. [Réseau à 4 noeuds](#réseau-à-4-noeuds)

## Fonctionnement en bref

```
Simulateur IoT ──► Backend (Express, :3000) ──► Blockchain : Hardhat (développement)
Navigateur ──────►        │                       ou 4 nœuds Besu QBFT (démonstration)
                          │                       └─ Smart Contract
                          └─ stockage off-chain (backend/data/)
```

L'interface a un onglet par étape du parcours : **1. Comptes** (création d'une paire de clés, puis attribution du rôle), un onglet par profil (avec le compte actif, son adresse et sa clé publique), et **Blockchain** (réseau, consensus, validateurs, derniers blocs avec la clé publique de chaque signataire). Après chaque action, le panneau **« Ce qui vient de se passer en coulisses »** détaille les étapes : hachage, signature, contrôles du contrat, bloc, événements.

| Profil | Ce qu'il fait |
|---|---|
| Fournisseur | Crée un lot, obtient son hash et son QR Code |
| Transporteur | Met à jour le statut du lot, envoie les mesures capteurs |
| Gestionnaire | Suit les lots et les alertes, règle les seuils, attribue les rôles |
| Destinataire | Valide la réception ou ouvre un litige |

Règles appliquées automatiquement par le contrat : température hors de la plage tolérée → alerte « chaîne du froid » ; date limite dépassée → alerte « retard ».

## Prérequis et installation

Il faut **Node.js 18 ou plus récent** (la version 20 LTS est recommandée) et **Git**. Aucun autre logiciel n'est nécessaire pour la démo. Le réseau Besu à 4 nœuds demande en plus Java 25+ et Besu (voir [network/README.md](network/README.md)).

Vérifiez d'abord votre version :

```bash
node --version
```

Si elle affiche `v18` ou plus, passez directement à [Installer le projet](#installer-le-projet).

### macOS

Option A, sans droits administrateur (recommandée, fonctionne même si Homebrew est cassé) :

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Fermez puis rouvrez le terminal, puis :

```bash
nvm install 20
```

Option B : télécharger l'installeur `.pkg` « 20.x LTS » sur https://nodejs.org et le lancer, ou `brew install node` si Homebrew fonctionne.

### Windows

Option A : télécharger l'installeur `.msi` « 20.x LTS » sur https://nodejs.org et accepter les options par défaut. Rouvrez ensuite PowerShell.

Option B, avec winget :

```powershell
winget install OpenJS.NodeJS.LTS
```

Utilisez **PowerShell** ou **Git Bash** pour les commandes ci-dessous. Si PowerShell refuse d'exécuter `npm` (« l'exécution de scripts est désactivée »), lancez une fois :

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Linux

Avec nvm (toutes distributions) :

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Rouvrez le terminal, puis :

```bash
nvm install 20
```

Les paquets `nodejs` des distributions sont souvent trop anciens ; vérifiez avec `node --version`.

### Installer le projet

```bash
git clone <url-du-dépôt> Logistic_Blockchain
cd Logistic_Blockchain
npm install
npm test
```

`npm test` compile le contrat et doit afficher `15 passing`. Les avertissements sur des « vulnerabilities » à la fin de `npm install` concernent les outils de développement Hardhat : ignorez-les, et ne lancez pas `npm audit fix --force`.

## Lancer la démo

Ouvrez **trois terminaux, tous dans le dossier du projet** (un nouveau terminal démarre dans votre dossier personnel : faites d'abord `cd` vers le projet). Les commandes sont les mêmes sur macOS, Windows et Linux.

**Terminal 1** : la blockchain locale. Laissez-la tourner.

```bash
npm run chain
```

**Terminal 2** : déploiement du contrat (une fois), puis le serveur.

```bash
npm run deploy
npm start
```

Ouvrez ensuite http://localhost:3000 dans le navigateur.

**Terminal 3** : au choix, quand un lot existe.

```bash
# Simulateur de capteur sur un lot (remplacez par l'identifiant réel, sans < >)
npm run iot -- 0x3ad5...a3623 --break

# ou le scénario complet automatique, sans interface (--details : toutes les coulisses)
npm run demo
```

Options du simulateur : `--break` (panne du groupe froid à mi-parcours), `--steps 10` (nombre de mesures), `--interval 2` (secondes entre deux mesures), `--account 0x…` (compte transporteur qui signe). Le `--` après `iot` est obligatoire.

Pour arrêter : `Ctrl+C` dans chaque terminal.

## Scénario de démonstration

Le détail de chaque étape est dans [docs/parcours.md](docs/parcours.md). Gardez un œil sur le panneau « coulisses » après chaque action.

0. **Comptes** : créer « Pharma Casablanca » (Fournisseur), « Trans-Atlas » (Transporteur) et « Pharmacie Centrale » (Destinataire). Les coulisses montrent clé privée → clé publique → adresse, puis la transaction du Gestionnaire qui attribue le rôle.
1. **Fournisseur** : créer un lot (vaccins, 2–8 °C, délai 30 min) pour « Pharmacie Centrale ». Un QR Code apparaît ; ouvrir la page de traçabilité dans un autre onglet.
2. **Transporteur** : enregistrer « Pris en charge » avec une note, puis « En transit ». La page de traçabilité se met à jour.
3. **Terminal 3** : `npm run iot -- <identifiant> --break`. La courbe de température se remplit en direct, deux points deviennent rouges et une alerte apparaît.
4. **Gestionnaire** : les indicateurs montrent la rupture de la chaîne du froid, l'alerte est listée.
5. **Destinataire** : ouvrir un litige avec le motif de la rupture.
6. **Test d'intégrité** : modifier un prix dans le fichier de `backend/data/`. La page de traçabilité affiche « Données off-chain MODIFIÉES », car le hash ne correspond plus à celui de la blockchain.
7. **Règle des délais** : créer un lot avec un délai de 1 minute et ne rien faire. Après environ 70 secondes, le « keeper » du serveur le déclare en retard sur la blockchain.
8. **Refus** : dans l'onglet Destinataire, choisir le compte « Destinataire (démo) » et tenter de valider le lot destiné à « Pharmacie Centrale ». Le contrat refuse (« Pas le destinataire ») et les coulisses montrent que rien n'a été inscrit.
9. **Blockchain** : l'onglet montre les derniers blocs reliés par leur hash et la clé publique retrouvée pour chaque transaction.

## Structure du dépôt

| Dossier ou fichier | Contenu |
|---|---|
| `contracts/LogisticsTraceability.sol` | Le Smart Contract : rôles, lots, historique, règles automatiques |
| `test/` | Tests unitaires du contrat |
| `scripts/deploy.js` | Déploie le contrat, attribue les rôles, écrit `deployment.json` |
| `scripts/iot-simulator.js` | Simule un capteur (température et GPS) sur un trajet |
| `scripts/demo-scenario.js` | Scénario complet en ligne de commande, de la création des comptes au litige |
| `scripts/network.js` | Génère et lance le réseau Besu à 4 nœuds, affiche son état |
| `config/demo-accounts.js` | Un compte de démonstration par profil |
| `backend/src/index.js` | Démarre l'API et sert l'interface |
| `backend/src/chain.js` | Connexion à la blockchain, comptes, signature, détail des coulisses, explorateur de blocs |
| `backend/src/store.js` | Stockage off-chain (un fichier par blockchain) et calcul des hashs |
| `backend/src/keeper.js` | Constate les retards sur la blockchain toutes les 10 s |
| `backend/src/routes/` | Routes API : comptes, lots, IoT, réseau et explorateur |
| `frontend/` | Interface web (comptes, profils, coulisses, explorateur) et page de traçabilité du QR Code |
| `network/` | Réseau privé Besu à 4 noeuds |
| `docs/` | Cadrage, parcours, consensus, persistance, plan de test |

Fichiers générés (ignorés par git) : `deployment.json`, `backend/data/`, `network/generated/` (clés privées des validateurs), `network/data/`, `artifacts/`, `cache/`, `node_modules/`.

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm test` | Compile et teste le contrat |
| `npm run chain` | Lance la blockchain locale (port 8545) |
| `npm run deploy` | Déploie le contrat sur la blockchain locale |
| `npm start` | Lance l'API et l'interface (port 3000) |
| `npm run iot -- <id> [--break]` | Simulateur de capteur |
| `npm run demo [-- --details]` | Scénario complet automatique |
| `npm run network:generate` | Génère les clés des 4 validateurs et le génésis (une fois) |
| `npm run network:local` | Lance les 4 nœuds Besu sur cette machine (données persistantes) |
| `npm run network:start -- <N> --ip <IP> [--bootnode <IP1>]` | Lance le nœud N sur cette machine (démo sur 4 laptops) |
| `npm run network:status` | État des nœuds : bloc, pairs, validateurs |
| `npm run deploy:besu` | Déploie le contrat sur le réseau Besu |

Variables d'environnement facultatives : `PORT` (défaut 3000), `RPC_URL` (défaut `http://127.0.0.1:8545`), `API_URL` pour les scripts.

## Dépannage

| Problème | Cause et solution |
|---|---|
| `Could not read package.json` | Le terminal n'est pas dans le dossier du projet : `cd` vers `Logistic_Blockchain`. |
| `deployment.json introuvable` au démarrage | Le contrat n'est pas déployé : lancez `npm run deploy` (avec `npm run chain` actif). |
| `No such file or directory` en lançant `npm run iot` | N'écrivez pas les `<` `>` autour de l'identifiant : ils servent seulement de marqueurs. |
| `EADDRINUSE` (port déjà utilisé) | Un ancien processus tourne encore. Fermez-le, ou changez de port : `PORT=3001 npm start` (PowerShell : `$env:PORT=3001; npm start`). |
| `Blockchain injoignable` dans l'interface | `npm run chain` n'est pas lancé ou s'est arrêté. |
| Lots disparus après avoir relancé `npm run chain` | Normal : Hardhat garde tout en mémoire. Relancez `npm run deploy` puis `npm start`. Pour des données permanentes, utilisez le réseau Besu ([docs/persistance.md](docs/persistance.md)). |
| `Role non autorise` | Le compte actif n'a pas le rôle requis (voir les coulisses), ou `npm run deploy` n'a pas été relancé après un redémarrage de la chaîne. |
| `brew install` échoue (permissions) | Utilisez nvm ou l'installeur officiel de Node, voir plus haut. |
| Erreurs de syntaxe ou de module au lancement | Node trop ancien : `node --version` doit afficher 18 ou plus. |

## Limites du prototype

- Le serveur détient les clés de tous les comptes (démonstration et comptes créés) et signe à la place des utilisateurs. En production, chaque acteur signerait depuis son propre wallet (par exemple MetaMask) et sa clé privée ne quitterait jamais son appareil.
- Les clés de démonstration sont publiques (mnémonique standard de Hardhat) : ne les utilisez jamais sur un vrai réseau.
- L'ordre des statuts n'est pas imposé et les données privées sont lisibles via l'API (pas d'authentification).
- Pas de notification push : les alertes s'affichent dans l'interface.
- Le stockage off-chain est un simple fichier JSON, sur la seule machine du backend.
- Testé de bout en bout avec Hardhat. Le réseau Besu : génération testée, lancement réel des nœuds pas encore testé ([plan de test](docs/test-4-machines.md)).

## Réseau à 4 noeuds

Pour la démonstration finale, la chaîne tourne sur un réseau privé Hyperledger Besu (QBFT) à 4 validateurs, un par laptop, avec des données écrites sur disque. Il nécessite Java 25+ et Besu (ou Docker sous macOS/Linux). Les 4 nœuds peuvent aussi tourner sur une seule machine pour répéter. Voir [network/README.md](network/README.md).
