# Logistic_Blockchain

Blockchain décentralisée pour la traçabilité d'une chaîne logistique.

Un Smart Contract Solidity enregistre les lots, leurs étapes de transport et les mesures des capteurs. Il applique automatiquement les règles (chaîne du froid, délais) et l'historique est consultable via un QR Code. Les données privées restent hors chaîne : seul leur hash est publié, ce qui permet de détecter toute modification.

Le projet se lance comme **une seule application** : `npm start` (ou un double-clic sur `Lancer.command` / `Lancer.bat`) ouvre l'interface dans le navigateur. Depuis cette interface, la machine crée un réseau ou en rejoint un, puis chaque utilisateur se connecte avec son compte.

Documentation :
- [docs/reseau.md](docs/reseau.md) : nœuds et comptes (qui est quoi), connexion entre machines, validateurs, dépannage réseau.
- [docs/framework.md](docs/framework.md) : cadrage, choix d'architecture, lien avec le cahier des charges.
- [docs/parcours.md](docs/parcours.md) : chaque étape du parcours et ce qui se passe en coulisses.
- [docs/consensus.md](docs/consensus.md) : pourquoi QBFT, avantages, limites, alternatives écartées.
- [docs/persistance.md](docs/persistance.md) : stockage permanent des données.
- [docs/test-4-machines.md](docs/test-4-machines.md) : plan de test du réseau sur 4 machines.
- [docs/suivi-debrief.md](docs/suivi-debrief.md) : suivi des décisions du dernier debrief.

## Fonctionnement en bref

```
        Machine A                          Machine B                       Téléphone, autre PC
 ┌──────────────────────┐          ┌──────────────────────┐
 │ Navigateur           │          │ Navigateur           │◄──── http://<IP de B>:3000
 │   │                  │          │   │                  │      (aucune installation)
 │ Application (:3000)  │◄────────►│ Application (:3000)  │
 │   │  comptes chiffrés│ annuaire │   │  comptes chiffrés│
 │   │  données privées │ des nœuds│   │  données privées │
 │ Nœud Besu            │◄────────►│ Nœud Besu            │
 │   copie de la chaîne │  blocs   │   copie de la chaîne │
 └──────────────────────┘  (QBFT)  └──────────────────────┘
```

Deux identités distinctes, une seule interface :

| | Nœud (la machine) | Compte (la personne ou l'organisation) |
|---|---|---|
| Ce que c'est | Une clé de nœud, créée au premier lancement | Une paire de clés protégée par un mot de passe |
| À quoi ça sert | Garder une copie de la chaîne, relayer, et voter sur les blocs s'il est validateur | Signer les actions métier (créer un lot, valider une réception…) |
| Comment on entre | Une fois : adresse d'une machine membre + code d'invitation | À chaque session : compte + mot de passe |
| Qui donne les droits | Les validateurs, par vote à la majorité | Le Gestionnaire, dans le Smart Contract |

Une machine peut donc être un nœud sans aucun utilisateur connecté, et une personne peut utiliser l'application d'une autre machine depuis son navigateur sans héberger de nœud. Le détail est dans [docs/reseau.md](docs/reseau.md).

| Profil | Ce qu'il fait |
|---|---|
| Fournisseur | Crée un lot, obtient son hash et son QR Code |
| Transporteur | Met à jour le statut du lot, envoie les mesures capteurs |
| Gestionnaire | Valide les demandes d'accès, suit les lots et les alertes, règle les seuils |
| Destinataire | Valide la réception ou ouvre un litige |

Après chaque action, le panneau **« Ce qui vient de se passer en coulisses »** détaille les étapes : hachage, signature, contrôles du contrat, bloc, événements. Règles appliquées automatiquement par le contrat : température hors de la plage tolérée → alerte « chaîne du froid » ; date limite dépassée → alerte « retard ».

## Prérequis et installation

Il faut **Node.js 18 ou plus récent** (la version 20 LTS est recommandée) et **Git**. C'est tout : au premier démarrage d'un nœud, l'application télécharge elle-même Java 25 et Hyperledger Besu dans son dossier `app-data/tools/` (environ 250 Mo), sans rien installer dans le système. Si Besu et Java 25+ sont déjà installés (dans le PATH, dans `~/tools/besu-*`, ou désignés par `BESU_BIN`), ils sont utilisés tels quels.

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
npm install --omit=dev
```

`--omit=dev` installe seulement ce qu'il faut pour lancer l'application. Pour modifier ou tester le contrat, faites `npm install` (complet) puis `npm test`, qui doit afficher `17 passing`. Les avertissements sur des « vulnerabilities » concernent les outils de développement Hardhat : ignorez-les, et ne lancez pas `npm audit fix --force`.

## Lancer l'application

```bash
npm start
```

ou double-cliquez sur `Lancer.command` (macOS, Linux) ou `Lancer.bat` (Windows), qui installent aussi les dépendances si nécessaire. Le navigateur s'ouvre sur http://localhost:3000. Fermer le terminal (ou `Ctrl+C`) arrête l'application et le nœud ; la blockchain reste sur disque et repart au lancement suivant.

### Première machine : créer le réseau

1. Choisir **Créer un réseau** : nom du réseau, nom de la machine, adresse sur le réseau local (proposée automatiquement), puis le nom et le mot de passe de votre compte.
2. L'application démarre le nœud, attend le premier bloc et déploie le Smart Contract avec votre compte : vous êtes le **Gestionnaire**.
3. Connectez-vous. L'onglet **Réseau** affiche l'adresse et le **code d'invitation** à communiquer aux autres.

### Machines suivantes : rejoindre

1. Lancer l'application, choisir **Rejoindre un réseau**, saisir l'adresse (par exemple `192.168.1.12:3000`), le code d'invitation et un nom de machine.
2. Le nœud démarre, se connecte aux autres et télécharge la chaîne. L'onglet **Réseau** montre les pairs ; le bouton **Diagnostiquer les connexions** explique tout blocage (pare-feu, Wi-Fi qui isole, mauvaise adresse).
3. Créer son compte (**Créer un compte** : nom, rôle demandé, mot de passe). La demande part sur la blockchain ; le Gestionnaire la voit sur sa machine et la valide. L'onglet du rôle apparaît alors tout seul.

### Passer à 4 validateurs

Au départ, seule la première machine valide les blocs. Dans l'onglet **Réseau** d'un validateur, **Voter pour l'ajouter aux validateurs** propose une machine ; elle est ajoutée quand plus de la moitié des validateurs ont voté pour elle (1 vote pour la 2e, 2 votes pour la 3e et la 4e). Faites-le quand toutes les machines sont connectées : avec 2 ou 3 validateurs, l'arrêt d'un seul peut suspendre la production de blocs ; à 4, le réseau tolère une panne.

### Sans installer : depuis un téléphone ou un autre poste

Toute machine du même réseau peut ouvrir `http://<IP d'un nœud>:3000` : consulter un lot par son QR Code, créer un compte et agir. Le compte est alors conservé (chiffré) par la machine qui héberge l'application.

### Répéter sur une seule machine

Plusieurs instances peuvent tourner sur le même poste, chacune avec son dossier et son port. Lancez-les une par une :

```bash
npm start                                   # instance 1 : http://localhost:3000
APP_HOME=app-data-2 PORT=3001 npm start     # instance 2 : rejoindre 127.0.0.1:3000
APP_HOME=app-data-3 PORT=3002 npm start     # etc.
```

PowerShell : `$env:APP_HOME="app-data-2"; $env:PORT=3001; npm start`. Chaque nœud Besu consomme environ 1 Go de mémoire.

### Scripts d'accompagnement

```bash
# Scénario complet automatique (--details : toutes les coulisses)
npm run demo -- --manager "MOA Logistique" --password <mot de passe du Gestionnaire>

# Le même, avec les trois autres acteurs inscrits sur trois autres machines : preuve de la réplication
npm run demo -- --manager "MOA Logistique" --password <mdp> --apis http://<IP2>:3000,http://<IP3>:3000,http://<IP4>:3000

# Simulateur de capteur sur un lot (remplacez par l'identifiant réel, sans < >)
npm run iot -- 0x3ad5...a3623 --user "Trans-Atlas" --password <mdp du Transporteur> --break
```

Options du simulateur : `--break` (panne du groupe froid à mi-parcours), `--steps 10` (nombre de mesures), `--interval 2` (secondes entre deux mesures). Le `--` après `iot` ou `demo` est obligatoire. Les scripts visent `http://localhost:3000` ; changez avec `API_URL`.

## Scénario de démonstration

Le détail de chaque étape est dans [docs/parcours.md](docs/parcours.md). Gardez un œil sur le panneau « coulisses » après chaque action. Idéalement, chaque acteur joue son rôle sur sa propre machine.

0. **Réseau** : la machine 1 crée le réseau, les trois autres le rejoignent, puis les validateurs les ajoutent par vote. L'onglet Réseau affiche « 4 validateurs, tolère 1 panne ».
1. **Comptes** : sur leurs machines, créer « Pharma Casablanca » (Fournisseur), « Trans-Atlas » (Transporteur) et « Pharmacie Centrale » (Destinataire). Les coulisses montrent clé privée → clé publique → adresse → demande d'accès. Le Gestionnaire valide les trois demandes dans son onglet.
2. **Fournisseur** : créer un lot (vaccins, 2–8 °C, délai 30 min) pour « Pharmacie Centrale ». Un QR Code apparaît ; ouvrir la page de traçabilité, y compris depuis une autre machine.
3. **Transporteur** : enregistrer « Pris en charge » avec une note, puis « En transit ». La page de traçabilité se met à jour partout.
4. **Capteur** : `npm run iot -- <identifiant> --user "Trans-Atlas" --password … --break`. La courbe de température se remplit en direct, deux points deviennent rouges et une alerte apparaît.
5. **Gestionnaire** : les indicateurs montrent la rupture de la chaîne du froid, l'alerte est listée.
6. **Destinataire** : ouvrir un litige avec le motif de la rupture.
7. **Panne d'un nœud** : fermer l'application d'une machine. Les trois autres continuent ; l'onglet Réseau le signale. La relancer : elle rattrape les blocs manqués.
8. **Test d'intégrité** : sur la machine du Fournisseur, modifier un prix dans `app-data/offchain/`. La page de traçabilité affiche « Données off-chain MODIFIÉES », car le hash ne correspond plus à celui de la blockchain.
9. **Règle des délais** : créer un lot avec un délai de 1 minute et ne rien faire. Après environ 70 secondes, un nœud le déclare en retard sur la blockchain, sans intervention humaine.
10. **Refus** : connecté en Fournisseur sur une machine, appeler une action de Transporteur (le scénario `npm run demo` le fait) : le contrat refuse (« Role non autorise ») et rien n'est inscrit.
11. **Blockchain** : l'onglet montre les derniers blocs reliés par leur hash, la machine qui a proposé chacun, et la clé publique retrouvée pour chaque transaction.

## Structure du dépôt

| Dossier ou fichier | Contenu |
|---|---|
| `contracts/LogisticsTraceability.sol` | Le Smart Contract : annuaire et rôles, lots, historique, règles automatiques |
| `test/` | Tests du contrat et de l'encodage du génésis |
| `backend/contract.json` | ABI et bytecode compilés, utilisés par l'application (produit par `npm run compile`) |
| `backend/src/index.js` | Point d'entrée : API, interface, démarrage du nœud |
| `backend/src/node.js` | Cycle de vie de la machine : créer, rejoindre, redémarrer, quitter, relance du consensus |
| `backend/src/besu.js` | Nœud Besu : installation, génésis, configuration, processus, JSON-RPC |
| `backend/src/peers.js` | Annuaire des nœuds, connexion entre machines, votes, diagnostic |
| `backend/src/auth.js` | Comptes utilisateurs chiffrés et sessions |
| `backend/src/chain.js` | Lecture du contrat, signature, détail des coulisses, explorateur de blocs |
| `backend/src/store.js` | Stockage hors chaîne et calcul des hashs |
| `backend/src/keeper.js` | Constate les retards sur la blockchain |
| `backend/src/routes/` | Routes API : configuration, réseau, connexion, lots, IoT, administration |
| `frontend/` | Interface web et page de traçabilité du QR Code |
| `scripts/` | Scénario de démonstration, simulateur de capteur, export du contrat compilé |
| `Lancer.command`, `Lancer.bat` | Lanceurs par double-clic |
| `docs/` | Réseau, cadrage, parcours, consensus, persistance, plan de test |

Tout ce que l'application écrit se trouve dans `app-data/` (ignoré par git) : `config.json` (réseau, annuaire des nœuds), `nodekey` (clé privée du nœud), `genesis.json`, `besu-data/` (la blockchain), `keystore/` (comptes chiffrés), `offchain/` (données privées et notes), `tools/` (Java et Besu téléchargés).

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm start` | Lance l'application (interface sur le port 3000) et le nœud de cette machine |
| `npm run demo -- --manager … --password …` | Scénario complet automatique |
| `npm run iot -- <id> --user … --password … [--break]` | Simulateur de capteur |
| `npm test` | Compile et teste le contrat (installation complète requise) |
| `npm run compile` | Recompile le contrat et met à jour `backend/contract.json` (à commiter) |

Variables d'environnement facultatives : `PORT` (défaut 3000), `APP_HOME` (dossier de données, défaut `app-data`), `BESU_BIN` (chemin de Besu), `BESU_OPTS` (défaut `-Xmx1g`), `P2P_PORT` et `RPC_PORT` (défauts 30303 et 8545, ajustés si occupés), `NO_OPEN=1` (ne pas ouvrir le navigateur), `API_URL` pour les scripts.

## Dépannage

Les problèmes de connexion entre machines sont traités dans [docs/reseau.md](docs/reseau.md#dépannage).

| Problème | Cause et solution |
|---|---|
| `Could not read package.json` | Le terminal n'est pas dans le dossier du projet : `cd` vers `Logistic_Blockchain`. |
| `Le port 3000 est déjà utilisé` | L'application tourne déjà (ouvrez http://localhost:3000), ou changez de port : `PORT=3001 npm start` (PowerShell : `$env:PORT=3001; npm start`). |
| Téléchargement de Besu ou de Java impossible | Pas d'accès Internet ou proxy : installez Java 25+ et Besu à la main (https://adoptium.net, https://github.com/besu-eth/besu/releases) et indiquez `BESU_BIN=/chemin/vers/bin/besu`. |
| « Ce nœud n'a pas encore rattrapé la blockchain » | Le nœud n'a aucun pair : onglet Réseau, **Diagnostiquer les connexions**. |
| « Réseau en pause » | Trop de validateurs éteints (il en faut 3 sur 4). Relancez-les ; la production reprend seule, en une à deux minutes. |
| `Role non autorise` | Le compte connecté n'a pas le rôle requis, ou sa demande n'est pas encore validée par le Gestionnaire. |
| Mot de passe oublié | Il n'existe pas de récupération : la clé est chiffrée avec lui. Créez un nouveau compte et faites retirer le rôle de l'ancien par le Gestionnaire. |
| `No such file or directory` en lançant `npm run iot` | N'écrivez pas les `<` `>` autour de l'identifiant : ils servent seulement de marqueurs. |
| Repartir de zéro | Onglet Réseau > **Quitter le réseau** (efface le nœud et sa chaîne, garde les comptes), ou supprimez le dossier `app-data/`. |
| Erreurs de syntaxe ou de module au lancement | Node trop ancien : `node --version` doit afficher 18 ou plus. |

## Limites du prototype

- Chaque application garde les clés de ses utilisateurs, chiffrées par leur mot de passe, et signe pour eux pendant leur session. Un utilisateur qui passe par l'application d'une autre machine lui confie donc sa clé chiffrée. En production, chaque acteur signerait depuis son propre wallet.
- Le code d'invitation protège l'annuaire et l'assistant, pas le protocole pair-à-pair lui-même : il faudrait y ajouter la liste d'autorisation des nœuds de Besu (*permissioning*). Les échanges entre applications sont en HTTP, à réserver à un réseau local ou à un VPN.
- Un compte ne se transfère pas encore d'une machine à l'autre (pas d'export du fichier de clé depuis l'interface).
- L'ordre des statuts n'est pas imposé. Les données privées d'un lot sont lisibles par quiconque accède à l'application de la machine qui les détient.
- Pas de notification push : les alertes s'affichent dans l'interface.
- Le stockage hors chaîne est un simple fichier JSON par machine.
- Testé de bout en bout avec 4 nœuds sur une seule machine (macOS). Le test sur 4 machines, et le téléchargement automatique de Besu sous Windows et Linux, restent à valider ([plan de test](docs/test-4-machines.md)).
