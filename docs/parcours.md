# Parcours détaillé, étape par étape

*Décisions du debrief : « décrire clairement chaque étape du parcours, à commencer par la création de compte » et « rendre visible ce qui se passe en arrière-plan à chaque étape ».*

Dans l'application, chaque action affiche un panneau **« Ce qui vient de se passer en coulisses »** qui reprend ces étapes avec les vraies valeurs (hash, signature, numéro de bloc). L'onglet **Blockchain** montre les blocs et la clé publique de chaque signataire.

Légende : 🔗 inscrit sur la blockchain · 🗄 stocké hors chaîne · 🖥 visible à l'écran

---

## Étape 0 : la machine entre dans le réseau (assistant de premier lancement)

**Qui :** la personne qui installe l'application sur une machine. Détail : [reseau.md](reseau.md).

| # | En coulisses | Où |
|---|---|---|
| 1 | Une **clé de nœud** est créée sur la machine. Elle donne son identifiant réseau et son adresse de validateur. | 🗄 |
| 2a | **Créer un réseau** : le bloc génésis est écrit avec cette machine comme seul validateur, le nœud démarre, puis le compte du fondateur déploie le Smart Contract et devient Gestionnaire. | 🔗 |
| 2b | **Rejoindre** : avec l'adresse d'un membre et le code d'invitation, la machine reçoit le génésis, l'adresse du contrat et l'annuaire des nœuds, puis télécharge toute la chaîne. | 🔗 |
| 3 | Pour devenir **validateur**, la machine doit recueillir le vote de plus de la moitié des validateurs en place. | 🔗 |

## Étape 1 : créer un compte (onglet « Connexion »)

**Qui :** tout nouvel acteur (fournisseur, transporteur, destinataire), sur sa machine. **Validé par :** le Gestionnaire, sur la sienne.

| # | En coulisses | Où |
|---|---|---|
| 1 | Une **clé privée** de 256 bits est tirée au hasard. Elle sert à signer ; elle ne doit jamais être partagée. | 🖥 (masquée) |
| 2 | La **clé publique** est calculée à partir de la clé privée (courbe elliptique secp256k1). Le calcul est à sens unique : on ne peut pas retrouver la clé privée. | 🖥 |
| 3 | L'**adresse** est dérivée de la clé publique : les 20 derniers octets de son hash keccak256. | 🖥 |
| 4 | La clé privée est **chiffrée avec le mot de passe** et enregistrée sur la machine. Se connecter, c'est la déchiffrer le temps de la session. | 🗄 |
| 5 | Le compte signe sa première transaction, `requestAccess(rôle, nom)` : il se présente et demande un rôle. Il n'a encore **aucun droit**. | 🔗 |
| 6 | La demande apparaît dans l'onglet du Gestionnaire, sur sa propre machine : elle a voyagé par la blockchain, pas par un serveur. Il signe `grantRole(adresse, rôle)`. | 🔗 |
| 7 | Le contrat vérifie que l'appelant est bien Gestionnaire, puis enregistre le rôle. L'onglet du rôle apparaît chez le demandeur. | 🔗 🖥 |

**À retenir :** créer un compte, c'est créer une paire de clés ; personne ne l'« inscrit ». Ce qui donne des droits, c'est le rôle écrit dans le contrat par le Gestionnaire. Les noms et les rôles forment un annuaire public, lu par toutes les machines.

## Étape 2 : créer un lot (onglet « Fournisseur »)

| # | En coulisses | Où |
|---|---|---|
| 1 | Les données privées (n° de lot interne, prix) sont **hachées** : seul ce hash partira sur la blockchain. | 🖥 |
| 2 | La transaction `createLot(...)` est construite : nature, quantité, plage de température, date limite, destinataire, hash. | 🖥 |
| 3 | Le fournisseur la **signe** avec sa clé privée. Les nœuds retrouvent sa clé publique à partir de la signature : l'auteur est prouvé. | 🔗 |
| 4 | Le contrat vérifie : rôle Fournisseur, destinataire valide, seuils cohérents, date limite future. | 🔗 |
| 5 | La transaction est diffusée aux autres nœuds et entre dans un **bloc**, qui contient le hash du bloc précédent. Avec 4 validateurs, 3 doivent l'approuver. | 🔗 |
| 6 | L'événement `LotCreated` donne l'**identifiant unique** du lot. | 🔗 |
| 7 | Les données privées sont enregistrées hors chaîne, sur la machine du fournisseur uniquement ; le **QR Code** contenant l'identifiant est généré. | 🗄 🖥 |

## Étape 3 : transporter (onglet « Transporteur »)

| # | En coulisses | Où |
|---|---|---|
| 1 | Le transporteur scanne le QR Code et choisit le nouveau statut (pris en charge, douane, stockage, transit). | 🖥 |
| 2 | La note éventuelle (« Entrepôt de Casablanca ») est hachée ; le texte reste hors chaîne, sur la machine du transporteur. Une autre machine qui affiche le lot la lui demande et vérifie son hash avant de l'afficher. | 🗄 |
| 3 | `updateStatus` est signée par le transporteur ; le contrat vérifie son rôle et que le lot n'est pas clôturé. | 🔗 |
| 4 | Le contrat vérifie aussi la **date limite** : si elle est dépassée, il lève une alerte « retard ». | 🔗 |

## Étape 4 : mesures des capteurs (`npm run iot` ou onglet « Transporteur »)

| # | En coulisses | Où |
|---|---|---|
| 1 | Le capteur ouvre une session au nom du transporteur, puis envoie température et position à la **passerelle IoT** (l'application de sa machine). | 🖥 |
| 2 | Un capteur ne sait pas signer : la passerelle signe `recordSensorData` avec le compte du transporteur. | 🔗 |
| 3 | Le contrat compare la température à la plage tolérée. Hors plage : alerte **« Rupture de la chaîne du froid »**, une seule fois par lot. | 🔗 |
| 4 | L'alerte apparaît dans l'onglet Gestionnaire et sur la page de traçabilité. | 🖥 |

## Étape 5 : contrôle automatique des délais (sans action humaine)

Un contrat ne s'exécute jamais seul. Toutes les 10 s, le **keeper** de chaque machine cherche les lots en retard et appelle `checkDeadline`, qui inscrit l'alerte « retard » sur la blockchain. Cette transaction est signée par la clé du nœud : elle fonctionne même si personne n'est connecté.

## Étape 6 : réception (onglet « Destinataire »)

| # | En coulisses | Où |
|---|---|---|
| 1 | Le destinataire consulte l'historique complet via le QR Code avant de signer. | 🖥 |
| 2a | **Réception conforme** : `confirmDelivery` signée. Le contrat vérifie que c'est bien le destinataire prévu, puis clôture le lot. | 🔗 |
| 2b | **Litige** : le motif est haché, puis `raiseDispute` est signée. Le lot passe en « Litige ». | 🔗 🗄 |
| 3 | Après clôture, plus aucune écriture n'est acceptée sur ce lot. | 🔗 |

## Étape 7 : consultation et audit (page ouverte par le QR Code)

| # | En coulisses | Où |
|---|---|---|
| 1 | L'historique est lu directement dans le contrat (lecture gratuite, aucune transaction). | 🔗 |
| 2 | La machine qui détient les données privées les **re-hache** et compare avec le hash inscrit : badge « intactes » ou « MODIFIÉES ». Les autres machines affichent « absentes de cette machine ». | 🖥 |
| 3 | La courbe de température affiche toutes les mesures et la plage tolérée. | 🖥 |

## Cas de refus (à montrer en démo)

Un acteur tente une action qui ne relève pas de son rôle, par exemple le Fournisseur qui veut mettre à jour un statut de transport. Le nœud **simule** la transaction, le contrat répond « Role non autorise », et **rien n'est inscrit**. Les coulisses affichent l'étape « Refusée par le Smart Contract ».

---

Pour voir tout ce parcours en une commande : `npm run demo -- --manager "<compte Gestionnaire>" --password <mot de passe> --details`.
