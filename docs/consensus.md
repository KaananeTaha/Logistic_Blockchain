# Choix du mécanisme de consensus : QBFT

*Décision du debrief : « choisir un mécanisme et préparer un argumentaire pour le défendre (pourquoi ce choix, avantages, limites, alternatives écartées) ».*

## 1. Le problème à résoudre

Sans autorité centrale, il faut une règle pour décider **quel bloc est ajouté ensuite** et garantir que tous les nœuds gardent **la même chaîne**, même si certains tombent en panne ou trichent. Cette règle est le mécanisme de consensus.

Notre contexte fixe les critères :

| Critère | Notre situation |
|---|---|
| Qui participe ? | Des acteurs **connus** (fournisseurs, transporteurs, gestionnaire) : réseau privé, permissionné. |
| Combien de nœuds ? | 4 validateurs (un par membre du groupe) pour la démonstration. |
| Finalité | Indispensable : une livraison signée transfère la responsabilité, elle ne doit jamais pouvoir être annulée. |
| Coût | Projet open-source, sans cryptomonnaie ni matériel de minage. |
| Délai | Quelques secondes par opération, adapté au flux logistique. |

## 2. Notre choix : QBFT (Hyperledger Besu)

QBFT (*Quorum Byzantine Fault Tolerance*) est un protocole de la famille BFT. Les validateurs sont désignés dans le bloc génésis et peuvent être ajoutés ou retirés par vote.

**Fonctionnement, pour chaque bloc (toutes les 2 s dans notre configuration) :**
1. **Proposition** : un validateur, désigné à tour de rôle, assemble les transactions en attente et diffuse le bloc.
2. **Préparation** : chaque validateur ré-exécute le bloc, le vérifie, puis annonce son accord.
3. **Engagement** : dès qu'un validateur voit l'accord d'un quorum, il s'engage. Le quorum vaut ⌈2N/3⌉, soit **3 sur 4**.
4. Avec 3 engagements, le bloc est **final** : il ne sera jamais remplacé.
5. Si le proposeur ne répond pas, les autres attendent `requesttimeoutseconds` (4 s), puis passent au proposeur suivant (*round change*).

Ce qu'en dit la documentation Besu : *« QBFT is the recommended enterprise-grade consensus protocol for private networks. »* ([docs.besu-eth.org](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft))

## 3. Avantages

- **Finalité immédiate.** *« QBFT and IBFT 2.0 have immediate finality; there are no forks and all valid blocks get included in the main chain. »* Une réception signée est définitive dès son bloc.
- **Tolérance aux fautes byzantines**, y compris aux nœuds malveillants et pas seulement aux pannes. Avec 4 validateurs : 1 validateur en panne ou malhonnête est toléré.
- **Rapide et économe** : pas de calcul de minage, un bloc toutes les 2 s.
- **Adapté à un consortium** : les validateurs sont identifiés, ce qui correspond à des entreprises partenaires.
- **Gratuit et compatible Ethereum** : même contrat Solidity, mêmes outils (Hardhat, ethers.js).

## 4. Limites (à assumer devant le client)

- **Il faut au moins 4 validateurs** pour tolérer une faute : *« To be Byzantine fault tolerant, QBFT and IBFT 2.0 require a minimum of four validators. »* Avec 4, une seule faute est tolérée.
- **La chaîne s'arrête si plus d'1/3 des validateurs manquent.** *« If more than 1/3 of validators stop participating, the network stops creating new blocks and stalls. »* Avec 2 laptops éteints sur 4, plus aucun bloc n'est produit, mais aucun bloc invalide n'est accepté non plus : QBFT préfère s'arrêter plutôt que risquer une incohérence. La reprise peut être lente ; le plus rapide est de redémarrer tous les validateurs.
- **Le coût augmente avec le nombre de validateurs** : *« the time to add new blocks increases as the number of validators increases. »* Chaque validateur échange des messages avec tous les autres. On garde donc peu de validateurs et on ajoute des nœuds non validateurs pour la lecture (ils ne ralentissent pas le consensus).
- **La confiance repose sur l'identité des validateurs.** Si 2 validateurs sur 4 collaboraient pour tricher, la garantie tomberait. En production, chaque validateur doit appartenir à une organisation différente.
- **Dans notre démo, les 4 validateurs appartiennent à la même équipe** : la décentralisation est démontrée techniquement, pas organisationnellement.

## 5. Alternatives écartées

| Mécanisme | Principe | Pourquoi écarté |
|---|---|---|
| **Preuve de travail (PoW)**, ex-Bitcoin | Les mineurs résolvent un calcul coûteux | Énergivore, lent, finalité seulement probabiliste. Avec 4 nœuds, une seule machine puissante contrôlerait la chaîne. Besu ne le prend plus en charge. |
| **Preuve d'enjeu (PoS)**, Ethereum public | Les validateurs immobilisent de la cryptomonnaie | Suppose un jeton à valeur économique et un grand nombre de participants anonymes : inadapté à un consortium connu. |
| **Clique (preuve d'autorité)** | Des signataires autorisés produisent les blocs à tour de rôle | Plus simple, mais *« Besu no longer supports the Clique consensus protocol. »* |
| **IBFT 2.0** | Prédécesseur de QBFT, même famille | Encore *« supported for existing private networks »*, mais QBFT est le protocole recommandé et Besu documente la migration d'IBFT 2.0 vers QBFT. Pour un nouveau réseau, autant partir sur QBFT. |
| **Raft** (ex-GoQuorum, ordonnanceur Hyperledger Fabric) | Un leader élu ordonne les transactions | Ne tolère que les pannes, pas les comportements malveillants : un leader malhonnête n'est pas détecté. Or l'enjeu du projet est justement la méfiance entre partenaires. |
| **Base de données centralisée** | Pas de consensus : le serveur décide | Celui qui héberge la base peut réécrire l'historique sans être détecté : c'est le problème que le projet doit résoudre. |

## 6. Questions probables du client et réponses

**« Pourquoi pas la blockchain Ethereum publique ? »**
Données commerciales visibles par tous, coût par transaction, finalité de plusieurs minutes. Nos partenaires sont connus : un réseau permissionné suffit et coûte moins cher.

**« Que se passe-t-il si un laptop s'éteint pendant la démo ? »**
Rien de visible : 3 validateurs sur 4 suffisent. Nous le montrerons en direct. Avec 2 laptops éteints, la chaîne se met en pause, puis reprend quand ils reviennent.

**« Pourquoi 4 nœuds et pas 3 ? »**
Avec 3 validateurs, le quorum est de 2 : un seul validateur malhonnête peut tout bloquer. 4 est le minimum pour tolérer une faute byzantine (formule N ≥ 3f + 1).

**« Les validateurs peuvent-ils falsifier l'historique ? »**
Un validateur seul, non : les 3 autres refusent tout bloc invalide, et chaque bloc contient le hash du précédent. Il faudrait corrompre au moins 2 des 4 validateurs, d'où l'importance de les confier à des organisations distinctes.

**« Et si on veut 20 partenaires ? »**
On garde un petit nombre de validateurs (par exemple un par grande organisation) et on ajoute les autres comme nœuds non validateurs, qui lisent et soumettent des transactions sans voter.

*Sources : documentation Hyperledger Besu ([consensus](https://docs.besu-eth.org/private-networks/how-to/configure/consensus), [preuve d'autorité](https://docs.besu-eth.org/private-networks/concepts/poa), [QBFT](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft)), consultée le 26/10/2026.*
