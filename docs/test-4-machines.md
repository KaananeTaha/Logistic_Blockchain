# Plan de test : déploiement sur 4 machines

*Décision du debrief : « tester le déploiement sur 4 machines ».*

Installation et commandes : [network/README.md](../network/README.md). Remplir la colonne « Résultat » pendant le test et l'apporter au prochain debrief.

## Préparation

| Machine | Membre | Système | IP | Java 25+ | Besu installé |
|---|---|---|---|---|---|
| 1 (amorçage) | | | | ☐ | ☐ |
| 2 | | | | ☐ | ☐ |
| 3 | | | | ☐ | ☐ |
| 4 | | | | ☐ | ☐ |

Conseil : faire d'abord la **répétition sur une seule machine** (`npm run network:local`, test 0), pour isoler les problèmes d'installation des problèmes de réseau.

## Tests

| # | Test | Procédure | Résultat attendu | Résultat |
|---|---|---|---|---|
| 0 | Répétition locale | `npm run network:local` puis `npm run network:status` sur une machine | 4 nœuds joignables, 3 pairs chacun, numéros de bloc qui avancent ensemble | |
| 1 | Connexion | Lancer les 4 nœuds (`network:start`), puis `network:status` avec les 4 adresses | Chaque nœud : 3 pairs, 4 validateurs, même numéro de bloc (à 1 près) | |
| 2 | Production de blocs | Relancer `network:status` après 10 s | Les numéros ont avancé d'environ 5 (1 bloc toutes les 2 s) ; le proposeur change d'un bloc à l'autre | |
| 3 | Déploiement | `deploy:besu` depuis la machine 1, puis `npm start` | Contrat déployé ; en-tête de l'interface : « QBFT · 4 validateurs · 3 pairs » | |
| 4 | Réplication | Créer un compte et un lot depuis l'interface de la machine 1. Lancer `npm start` sur la machine 3 avec `RPC_URL=http://<IP3>:8545` et le même `deployment.json` | Le lot et son historique apparaissent sur la machine 3 : la donnée a été répliquée par le réseau. Les données privées restent sur le serveur de la machine 1 (badge « introuvables » : normal) | |
| 5 | Panne d'un nœud | Arrêter le nœud 4 (Ctrl+C), puis faire une action dans l'interface | L'action réussit : 3 validateurs sur 4 suffisent | |
| 6 | Retour du nœud | Relancer le nœud 4 | Il rattrape les blocs manquants et retrouve le même numéro que les autres | |
| 7 | Perte du quorum | Arrêter les nœuds 3 et 4, tenter une action | Plus aucun bloc n'est produit, l'action reste en attente ; aucune donnée incohérente | |
| 8 | Reprise | Relancer les nœuds 3 et 4 | La production reprend. Si c'est long, redémarrer les 4 nœuds (recommandation de la doc Besu) | |
| 9 | Persistance | Arrêter les 4 nœuds et le backend, puis tout relancer **sans redéployer** | Lots, historique, comptes et intégrité « ok » toujours présents | |
| 10 | Intégrité | Modifier un prix dans `backend/data/*.json` | La page du lot affiche « Données off-chain MODIFIÉES » | |

## Problèmes fréquents

| Symptôme | Piste |
|---|---|
| `network:status` : 0 pair | Pare-feu (ports 30303 TCP+UDP), mauvaise IP dans `--ip` ou `--bootnode`, Wi-Fi qui isole les appareils (essayer un partage de connexion ou Tailscale) |
| Les nœuds ont des numéros de bloc différents qui n'avancent pas | Génésis différent : tout le monde doit utiliser le même `genesis.json` |
| Aucun bloc produit | Moins de 3 nœuds connectés : vérifier les pairs |
| `Besu introuvable` | Définir `BESU_BIN` (voir network/README.md) |
| Machine très lente | Besu consomme beaucoup de mémoire : `BESU_OPTS=-Xmx1g` |

## À rapporter au client

- Tableau ci-dessus rempli.
- Captures : `network:status` avec les 4 nœuds, onglet Blockchain (validateurs, blocs), test 5 réussi.
- Problèmes rencontrés et solutions.
