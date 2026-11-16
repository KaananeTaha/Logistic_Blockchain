# Persistance des données

*Décision du debrief : « rechercher une méthode de stockage permanent des données ».*

## 1. Le constat

Dans la première version de la démo, la blockchain tournait sur **Hardhat**. Hardhat garde tout **en mémoire** : à l'arrêt du terminal, tous les blocs, lots et comptes disparaissent. C'est voulu pour le développement (on repart d'un état propre), mais inacceptable pour une démonstration réaliste.

Le projet stocke deux types de données :

| Donnée | Où | Persistance avant | Persistance maintenant |
|---|---|---|---|
| Blocs, transactions, état du contrat (lots, rôles, historique) | Blockchain | Perdue à l'arrêt de Hardhat | **Écrite sur disque par chaque nœud Besu** |
| Données privées, notes | Stockage hors chaîne (`app-data/offchain/`) | Fichier JSON unique, désynchronisé si la chaîne repartait de zéro | **Un fichier par blockchain** (identifiant de chaîne + adresse du contrat), sur la machine de leur auteur |
| Comptes utilisateurs | `app-data/keystore/` | Clés en clair dans le fichier hors chaîne | **Un fichier chiffré par compte** (mot de passe) ; noms et rôles sur la blockchain |

## 2. Options étudiées pour la blockchain

| Option | Persistant ? | Verdict |
|---|---|---|
| Hardhat | Non, tout est en mémoire | Gardé pour les tests automatiques du contrat. |
| Ganache avec base sur disque | Oui | Projet archivé et plus maintenu : écarté. |
| Anvil (Foundry) avec export d'état | Oui, par sauvegarde d'un fichier d'état | Outil de développement à nœud unique, non évalué en détail : il ne résout pas la décentralisation, donc il ne nous rapproche pas de la démo finale. |
| **Nœuds Besu avec un dossier de données** | **Oui** : chaque nœud écrit blocs et état dans sa base locale (RocksDB) | **Retenu** : c'est le fonctionnement normal d'une vraie blockchain, et c'est le réseau de la démonstration finale. |

Point clé : **dans une vraie blockchain, la persistance vient de la réplication.** Chacun des 4 nœuds garde une copie complète sur son disque. Si un laptop perd ses données, il les récupère auprès des autres au redémarrage.

## 3. Ce qui a été mis en place

- L'application (`npm start`) lance le nœud Besu de la machine, avec ses données dans `app-data/besu-data/`. Fermer puis relancer l'application conserve toute la chaîne.
- Tout l'état de la machine tient dans `app-data/` : la chaîne, la clé du nœud, les comptes chiffrés, les données hors chaîne. Sauvegarder ce dossier sauvegarde tout.
- Réseau > **Quitter le réseau** efface volontairement le nœud et sa chaîne (les comptes sont conservés).
- Le stockage hors chaîne utilise un fichier par blockchain (`app-data/offchain/<chainId>-<contrat>.json`). Changer de réseau ne mélange pas les données.

## 4. Test de persistance (réussi sur une machine avec les 4 nœuds, le 26/10 puis le 16/11/2026 avec l'application)

1. Créer le réseau, y faire entrer les autres machines, créer des comptes et un lot, enregistrer quelques étapes.
2. Fermer **toutes** les applications (Ctrl+C).
3. Les relancer (`npm start`).
4. Attendu : les nœuds se retrouvent seuls ; le lot, son historique, les comptes et leurs rôles sont toujours là ; chacun se reconnecte avec son mot de passe.

## 5. Limites et suite

- Le stockage hors chaîne reste un **fichier JSON** par machine, sans sauvegarde automatique. En production : une vraie base (PostgreSQL) avec sauvegardes, et une base par organisation.
- Les documents volumineux (bons de livraison, photos, certificats) pourraient aller dans un stockage de fichiers (S3, ou IPFS), avec leur hash sur la blockchain, sur le même principe que les données privées actuelles.
- Les clés privées des comptes sont chiffrées par mot de passe, mais gardées par l'application (prototype) : en production, elles resteraient dans le wallet de chaque acteur. Un mot de passe oublié rend le compte inutilisable.
