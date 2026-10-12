# Logistic_Blockchain

Blockchain décentralisée pour la traçabilité d'une chaîne logistique .

Un Smart Contract Solidity enregistre les lots, leurs étapes de transport et les mesures des capteurs. Il applique automatiquement les règles (chaîne du froid, délais) et l'historique est consultable via un QR Code. Les données privées restent hors-chaîne : seul leur hash est publié, ce qui permet de détecter toute modification.

Choix d'architecture et lien avec le cahier des charges : [docs/framework.md](docs/framework.md).

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
Simulateur IoT ──► Backend (Express, :3000) ──► Blockchain (Hardhat, :8545)
Navigateur ──────►        │                       └─ Smart Contract
                          └─ stockage off-chain (backend/data/)
```

| Profil | Ce qu'il fait |
|---|---|
| Fournisseur | Crée un lot, obtient son hash et son QR Code |
| Transporteur | Met à jour le statut du lot, envoie les mesures capteurs |
| Gestionnaire | Suit les lots et les alertes, règle les seuils, attribue les rôles |
| Destinataire | Valide la réception ou ouvre un litige |

Règles appliquées automatiquement par le contrat : température hors de la plage tolérée → alerte « chaîne du froid » ; date limite dépassée → alerte « retard ».

## Prérequis et installation

Il faut **Node.js 18 ou plus récent** (la version 20 LTS est recommandée) et **Git**. Aucun autre logiciel n'est nécessaire pour la démo (Docker n'est requis que pour le réseau à 4 noeuds).

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

`npm test` compile le contrat et doit afficher `13 passing`. Les avertissements sur des « vulnerabilities » à la fin de `npm install` concernent les outils de développement Hardhat : ignorez-les, et ne lancez pas `npm audit fix --force`.

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

# ou le scénario complet automatique, sans interface
npm run demo
```

Options du simulateur : `--break` (panne du groupe froid à mi-parcours), `--steps 10` (nombre de mesures), `--interval 2` (secondes entre deux mesures). Le `--` après `iot` est obligatoire.

Pour arrêter : `Ctrl+C` dans chaque terminal.

## Scénario de démonstration

1. **Fournisseur** : créer un lot (vaccins, 2–8 °C, délai 30 min). Un QR Code apparaît ; ouvrir la page de traçabilité dans un autre onglet.
2. **Transporteur** : enregistrer « Pris en charge » avec une note, puis « En transit ». La page de traçabilité se met à jour.
3. **Terminal 3** : `npm run iot -- <identifiant> --break`. La courbe de température se remplit en direct, deux points deviennent rouges et une alerte apparaît.
4. **Gestionnaire** : les indicateurs montrent la rupture de la chaîne du froid, l'alerte est listée.
5. **Destinataire** : ouvrir un litige avec le motif de la rupture.
6. **Test d'intégrité** : modifier un prix dans `backend/data/offchain.json`. La page de traçabilité affiche « Données off-chain MODIFIÉES », car le hash ne correspond plus à celui de la blockchain.
7. **Règle des délais** : créer un lot avec un délai de 1 minute et ne rien faire. Après environ 70 secondes, le « keeper » du serveur le déclare en retard sur la blockchain.

## Structure du dépôt

| Dossier ou fichier | Contenu |
|---|---|
| `contracts/LogisticsTraceability.sol` | Le Smart Contract : rôles, lots, historique, règles automatiques |
| `test/` | Tests unitaires du contrat |
| `scripts/deploy.js` | Déploie le contrat, attribue les rôles, écrit `deployment.json` |
| `scripts/iot-simulator.js` | Simule un capteur (température et GPS) sur un trajet |
| `scripts/demo-scenario.js` | Scénario complet en ligne de commande |
| `config/demo-accounts.js` | Un compte de démonstration par profil |
| `backend/src/index.js` | Démarre l'API et sert l'interface |
| `backend/src/chain.js` | Connexion à la blockchain, signature des transactions |
| `backend/src/store.js` | Stockage off-chain et calcul des hashs |
| `backend/src/keeper.js` | Constate les retards sur la blockchain toutes les 10 s |
| `backend/src/routes/` | Routes API : lots, IoT, administration |
| `frontend/` | Interface web (un onglet par profil) et page de traçabilité du QR Code |
| `network/` | Réseau privé Besu à 4 noeuds |
| `docs/framework.md` | Cadrage et choix d'architecture |

Fichiers générés (ignorés par git) : `deployment.json`, `backend/data/`, `artifacts/`, `cache/`, `node_modules/`.

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm test` | Compile et teste le contrat |
| `npm run chain` | Lance la blockchain locale (port 8545) |
| `npm run deploy` | Déploie le contrat sur la blockchain locale |
| `npm start` | Lance l'API et l'interface (port 3000) |
| `npm run iot -- <id> [--break]` | Simulateur de capteur |
| `npm run demo` | Scénario complet automatique |
| `npm run deploy:besu` | Déploie sur le réseau Besu (voir `network/README.md`) |

Variables d'environnement facultatives : `PORT` (défaut 3000), `RPC_URL` (défaut `http://127.0.0.1:8545`), `API_URL` pour les scripts.

## Dépannage

| Problème | Cause et solution |
|---|---|
| `Could not read package.json` | Le terminal n'est pas dans le dossier du projet : `cd` vers `Logistic_Blockchain`. |
| `deployment.json introuvable` au démarrage | Le contrat n'est pas déployé : lancez `npm run deploy` (avec `npm run chain` actif). |
| `No such file or directory` en lançant `npm run iot` | N'écrivez pas les `<` `>` autour de l'identifiant : ils servent seulement de marqueurs. |
| `EADDRINUSE` (port déjà utilisé) | Un ancien processus tourne encore. Fermez-le, ou changez de port : `PORT=3001 npm start` (PowerShell : `$env:PORT=3001; npm start`). |
| `Blockchain injoignable` dans l'interface | `npm run chain` n'est pas lancé ou s'est arrêté. |
| Lots disparus ou erreurs après avoir relancé `npm run chain` | La blockchain locale repart de zéro. Relancez `npm run deploy`, puis supprimez le dossier `backend/data/` (qui contient les données de l'ancienne chaîne) et redémarrez `npm start`. |
| `Role non autorise` | L'action est faite avec le mauvais profil, ou `npm run deploy` n'a pas été relancé après un redémarrage de la chaîne. |
| `brew install` échoue (permissions) | Utilisez nvm ou l'installeur officiel de Node, voir plus haut. |
| Erreurs de syntaxe ou de module au lancement | Node trop ancien : `node --version` doit afficher 18 ou plus. |

## Limites du prototype

- Le serveur détient les clés des quatre comptes de démonstration et signe à la place des utilisateurs. En production, chaque acteur signerait depuis son propre wallet (par exemple MetaMask).
- Les clés de démonstration sont publiques (mnémonique standard de Hardhat) : ne les utilisez jamais sur un vrai réseau.
- L'ordre des statuts n'est pas imposé et les données privées sont lisibles via l'API (pas d'authentification).
- Pas de notification push : les alertes s'affichent dans l'interface.
- Le stockage off-chain est un simple fichier JSON.
- Testé avec Hardhat ; le déploiement sur le réseau Besu n'a pas encore été essayé.

## Réseau à 4 noeuds

Pour la démonstration finale, la chaîne peut tourner sur un réseau privé Hyperledger Besu (QBFT) à 4 validateurs, un par laptop. Il nécessite Docker : voir [network/README.md](network/README.md).
