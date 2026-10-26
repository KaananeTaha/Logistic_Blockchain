# Persistance des données

*Décision du debrief : « rechercher une méthode de stockage permanent des données ».*

## 1. Le constat

Dans la démo actuelle, la blockchain tourne sur **Hardhat** (`npm run chain`). Hardhat garde tout **en mémoire** : à l'arrêt du terminal, tous les blocs, lots et comptes disparaissent. C'est voulu pour le développement (on repart d'un état propre), mais inacceptable pour une démonstration réaliste.

Le projet stocke deux types de données :

| Donnée | Où | Persistance avant | Persistance maintenant |
|---|---|---|---|
| Blocs, transactions, état du contrat (lots, rôles, historique) | Blockchain | Perdue à l'arrêt de Hardhat | **Écrite sur disque par chaque nœud Besu** |
| Données privées, notes, comptes créés | Stockage hors chaîne (`backend/data/`) | Fichier JSON unique, désynchronisé si la chaîne repartait de zéro | **Un fichier par blockchain** (identifiant de chaîne + adresse du contrat) |

## 2. Options étudiées pour la blockchain

| Option | Persistant ? | Verdict |
|---|---|---|
| Hardhat (actuel) | Non, tout est en mémoire | Gardé pour le développement et les tests automatiques. |
| Ganache avec base sur disque | Oui | Projet archivé et plus maintenu : écarté. |
| Anvil (Foundry) avec export d'état | Oui, par sauvegarde d'un fichier d'état | Outil de développement à nœud unique, non évalué en détail : il ne résout pas la décentralisation, donc il ne nous rapproche pas de la démo finale. |
| **Nœuds Besu avec `--data-path`** | **Oui** : chaque nœud écrit blocs et état dans sa base locale (RocksDB) | **Retenu** : c'est le fonctionnement normal d'une vraie blockchain, et c'est le réseau de la démonstration finale. |

Point clé : **dans une vraie blockchain, la persistance vient de la réplication.** Chacun des 4 nœuds garde une copie complète sur son disque. Si un laptop perd ses données, il les récupère auprès des autres au redémarrage.

## 3. Ce qui a été mis en place

- `npm run network:local` lance les **4 nœuds Besu sur une seule machine**, avec leurs données dans `network/data/node1` à `node4`. Arrêter puis relancer conserve toute la chaîne.
- `npm run network:start` fait de même avec **un nœud par machine** (démonstration sur 4 laptops).
- `npm run network:reset -- --yes` efface volontairement les données (nouvelle chaîne vierge).
- Le stockage hors chaîne utilise un fichier par blockchain (`backend/data/<chainId>-<contrat>.json`). Changer de réseau ou redéployer ne mélange plus les données.

## 4. Test de persistance à réaliser

1. `npm run network:local`, puis `npm run deploy:besu`, puis `npm start`.
2. Créer un compte et un lot, enregistrer quelques étapes.
3. Arrêter **tout** (Ctrl+C dans chaque terminal).
4. Relancer `npm run network:local` et `npm start`, **sans redéployer**.
5. Attendu : le lot, son historique, les comptes et l'intégrité « ok » sont toujours là, au même numéro de bloc.

## 5. Limites et suite

- Le stockage hors chaîne reste un **fichier JSON** sur la machine du backend : un seul serveur, pas de sauvegarde automatique. En production : une vraie base (PostgreSQL) avec sauvegardes, et une base par organisation.
- Les documents volumineux (bons de livraison, photos, certificats) pourraient aller dans un stockage de fichiers (S3, ou IPFS), avec leur hash sur la blockchain, sur le même principe que les données privées actuelles.
- Les clés privées des comptes créés sont stockées en clair dans ce fichier (prototype) : en production, elles resteraient dans le wallet de chaque acteur.
