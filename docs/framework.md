# Framework du projet — Blockchain de traçabilité logistique (PRJINFO-18)

## 1. Ce que demandent les documents

**Cahier des charges** : remplacer les registres centralisés (Excel, ERP cloisonnés), opaques et falsifiables, par une application décentralisée qui :
1. enregistre de façon immuable, horodatée et signée chaque événement logistique ;
2. applique automatiquement des règles via Smart Contracts (chaîne du froid, délais) ;
3. permet de retracer l'historique d'un lot grâce à un identifiant unique.

Contraintes : open-source uniquement, confirmation de transaction adaptée au flux logistique, **confidentialité** (données sensibles hachées / hors chaîne).
Livrables : spécifications, code des Smart Contracts, API d'intégration, interface Web/Mobile, réseau blockchain de démonstration, manuel + guide de déploiement.

**Canevas de spécifications** : 4 profils, 9 services (budget total **25 j/h**), 8 fonctions croisées avec les profils.

## 2. Décisions d'architecture

| Décision | Choix | Pourquoi |
|---|---|---|
| Blockchain | **Ethereum / Solidity** sur un réseau privé **Hyperledger Besu (QBFT)** ; Hardhat pour compiler et tester le contrat | Open-source, cité dans le CDC, outillage de test simple. Hyperledger Fabric serait plus « permissionné » mais beaucoup plus lourd à mettre en place pour un projet académique. |
| Confidentialité | Hash on-chain, données brutes **off-chain** (fichier JSON dans le prototype, vraie base ensuite) | Exigence CDC : seul `dataHash` est publié ; on peut prouver l'intégrité sans révéler le contenu. |
| Accès | Rôles gérés dans le contrat : chaque compte demande un rôle (`requestAccess`), le Gestionnaire l'attribue (`grantRole`) | Les 4 profils ont des droits différents (feuille *Fct-Profil*). L'annuaire étant on-chain, toutes les machines voient les mêmes comptes sans serveur central. |
| Smart Contract « automatique » | Vérification à chaque mise à jour (capteur / statut) | Une blockchain ne s'exécute pas seule : les règles se déclenchent à chaque transaction, et un événement `AnomalyRaised` alimente les alertes. |
| IoT | Passerelle dans l'application (simulateur au début) | Les capteurs ne signent pas de transactions ; la passerelle le fait pour eux avec la session d'un Transporteur. |
| Deux identités | Le **nœud** (la machine) et le **compte** (la personne) sont distincts ; une seule interface gère les deux | Peu de validateurs, beaucoup d'utilisateurs ; un utilisateur n'a pas à héberger un nœud. Voir [reseau.md](reseau.md). |
| Signature (prototype) | Chaque application garde les clés de ses utilisateurs, chiffrées par leur mot de passe, et signe pendant leur session | Évite d'installer MetaMask pour la démo, tout en gardant une clé par acteur, sur sa machine. En production, chaque acteur signe depuis son propre wallet. |
| Délais | Le « keeper » de chaque nœud appelle `checkDeadline()` toutes les 10 s, signé par la clé du nœud | Sans transaction, aucune règle ne s'exécute : un lot oublié ne serait jamais signalé en retard. |
| Application unique | Un seul processus Node.js lance l'interface, l'API et le nœud Besu ; Java et Besu sont téléchargés au besoin | Une seule chose à installer (Node.js) et une seule commande sur chaque machine. Un second langage (Python, par exemple) aurait ajouté une installation par machine sans rien apporter : tout le projet repose déjà sur ethers.js. |

## 3. Architecture en couches

```
 Sur chaque machine :
 Capteurs IoT / simulateur ──► Application (API Express) ──► Nœud Besu local ◄──► nœuds des autres machines
 Interface web (HTML/JS)   ──►   │  comptes chiffrés              │
          ▲                      │  annuaire des nœuds            └─ Smart Contract (même état partout)
          └──────────────────────┴─ données privées hors chaîne (propres à la machine)
```

1. **Couche on-chain** ([contracts/LogisticsTraceability.sol](../contracts/LogisticsTraceability.sol)) : vérité et règles. Stocke lots, historique, rôles ; émet des événements.
2. **Couche application** ([backend/](../backend)) : gestion du nœud (création, adhésion, pairs, validateurs), comptes et sessions, pont vers la chaîne, génération de QR Code, passerelle IoT, stockage off-chain, contrôle d'intégrité, keeper des délais.
3. **Couche interface** ([frontend/](../frontend)) : assistant de premier lancement, connexion, onglet du profil connecté, réseau, explorateur + une page publique de traçabilité ouverte par le QR Code.

## 4. Correspondance Canevas → Code

| Fonction (feuille *Fct-Profil*) | Profils | Service(s) du canevas | j/h | Où dans le code |
|---|---|---|---|---|
| Fct1 Création & enregistrement de lot | Fournisseur, Gestionnaire | Saisir détails / Hash / QR | 2+3+1 | `createLot`, `POST /api/lots`, onglet Fournisseur |
| Fct2 Mise à jour du statut | Transporteur, Gestionnaire | Scanner et mettre à jour | 3 | `updateStatus`, `POST /api/lots/:id/status` |
| Fct3 Données IoT | Transporteur, Gestionnaire | Transmettre données capteurs | 4 | `recordSensorData`, `routes/iot.js`, `scripts/iot-simulator.js` |
| Fct4 Exécution Smart Contracts | Tous | Validation auto + alerte | 5+2 | `recordSensorData`, `_checkDeadline`, `backend/src/keeper.js`, événement `AnomalyRaised` |
| Fct5 Consultation (QR) | Tous | Scanner pour consulter | 3 | `getLot`, `getHistory`, `frontend/lot.html` |
| Fct6 Validation livraison | Transporteur, Gestionnaire, Destinataire | Valider la réception | 2 | `confirmDelivery`, `raiseDispute` |
| Fct7 Dashboard & Analytics | Gestionnaire | *(absent des 9 services)* | — | `GET /api/alerts`, onglet Gestionnaire |
| Fct8 Gestion des accès & Smart Contracts | Gestionnaire | *(absent des 9 services)* | — | `requestAccess`, `grantRole`, `setRules`, onglet Gestionnaire |

**Points à clarifier avec M. Tazi** (incohérences entre les documents) :
- Fct7 et Fct8 n'ont aucun service chiffré dans la feuille *Services* : budget à ajouter.
- Le canevas ajoute un profil « Système / Smart Contract » ; le CDC parle aussi d'« Auditeurs » (lecture seule) qui n'ont pas de profil dédié.
- Le CDC mentionne la **réservation/allocation de ressources de transport et stockage** (objectif principal), mais aucune fonction ne la couvre.
- Fct4 est cochée pour le Fournisseur et le Destinataire, alors que leurs services ne la déclenchent pas.
- Le CDC cite `PRJINFO-01` pour le budget, le titre `PRJINFO-18` : probable coquille.

## 5. Planification (phases du CDC)

| Phase | Contenu | Livrables dans ce dépôt |
|---|---|---|
| 1 | Analyse, cahier des charges | `docs/` |
| 2 | Conception : contrat, schéma off-chain | `contracts/`, `backend/src/store.js` |
| 3 | Développement back + front | `backend/`, `frontend/` |
| 4 | Tests, sécurité, recette | `test/`, audit du contrat (Slither) |

## 6. Démarrage

Voir le [README](../README.md) à la racine (installation, démo pas à pas).

### Réseau à 4 noeuds (un par laptop)

La chaîne tourne sur un réseau privé **Hyperledger Besu (QBFT)** : 4 validateurs, un par membre, tolérance à 1 panne, données persistantes sur disque. L'application crée le réseau, y fait entrer les machines et gère les validateurs. Voir [reseau.md](reseau.md), [consensus.md](consensus.md) et [persistance.md](persistance.md). Hardhat ne sert plus qu'à compiler et tester le contrat.

## 7. Limites connues du prototype

- Chaque application conserve les clés (chiffrées) de ses utilisateurs et signe pendant leur session : à remplacer par un wallet par acteur (MetaMask).
- Le code d'invitation ne protège pas le protocole pair-à-pair lui-même : ajouter la liste d'autorisation des nœuds de Besu.
- L'ordre des statuts n'est pas imposé (ex. `Créé → En douane` est accepté).
- Les données privées d'un lot sont lisibles par quiconque accède à l'application de la machine qui les détient.
- Pas de notification push (mail/websocket) : les alertes s'affichent dans le tableau de bord.
- Le stockage off-chain est un fichier JSON par machine, suffisant pour une démo mais pas pour plusieurs utilisateurs simultanés.
- Testé de bout en bout sur 4 nœuds Besu (une machine). Test sur 4 machines à mener ([plan de test](test-4-machines.md)).
