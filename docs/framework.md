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
| Blockchain | **Ethereum / Solidity**, Hardhat en local (Polygon possible en démo) | Open-source, cité dans le CDC, outillage de test simple. Hyperledger Fabric serait plus « permissionné » mais beaucoup plus lourd à mettre en place pour un projet académique. |
| Confidentialité | Hash on-chain, données brutes **off-chain** (fichier JSON dans le prototype, vraie base ensuite) | Exigence CDC : seul `dataHash` est publié ; on peut prouver l'intégrité sans révéler le contenu. |
| Accès | Rôles gérés dans le contrat (`grantRole`) | Les 4 profils ont des droits différents (feuille *Fct-Profil*). |
| Smart Contract « automatique » | Vérification à chaque mise à jour (capteur / statut) | Une blockchain ne s'exécute pas seule : les règles se déclenchent à chaque transaction, et un événement `AnomalyRaised` alimente les alertes. |
| IoT | Passerelle backend (simulateur au début) | Les capteurs ne signent pas de transactions ; la passerelle le fait pour eux avec un compte Transporteur. |
| Signature (prototype) | Le backend détient les clés des 4 comptes de démo | Évite d'installer MetaMask pour la démo. En production, chaque acteur signe depuis son propre wallet. |
| Délais | Un « keeper » appelle `checkDeadline()` toutes les 10 s | Sans transaction, aucune règle ne s'exécute : un lot oublié ne serait jamais signalé en retard. |

## 3. Architecture en couches

```
 Capteurs IoT / simulateur ──► Backend (API Express) ──► Smart Contract (Hardhat / Ethereum)
 Interface web (HTML/JS)   ──►      │   ▲                       │
          ▲                          ▼   └── événements ◄────────┘
          └────────────────── DB off-chain (données privées, index, alertes)
```

1. **Couche on-chain** ([contracts/LogisticsTraceability.sol](../contracts/LogisticsTraceability.sol)) : vérité et règles. Stocke lots, historique, rôles ; émet des événements.
2. **Couche backend** ([backend/](../backend)) : pont vers la chaîne, génération de QR Code, passerelle IoT, stockage off-chain, contrôle d'intégrité, keeper des délais.
3. **Couche frontend** ([frontend/](../frontend)) : un onglet par profil + une page publique de traçabilité ouverte par le QR Code.

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
| Fct8 Gestion des accès & Smart Contracts | Gestionnaire | *(absent des 9 services)* | — | `grantRole`, `setRules` |

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

Pour la démo, la chaîne tourne sur un réseau privé **Hyperledger Besu (QBFT)** : 4 validateurs, un par membre, tolérance à 1 panne, données persistantes sur disque. Voir [network/README.md](../network/README.md), [consensus.md](consensus.md) et [persistance.md](persistance.md). Hardhat local reste utilisé pour le développement et les tests.

## 7. Limites connues du prototype

- Le serveur conserve les clés privées de tous les comptes et signe à leur place : à remplacer par un wallet par acteur (MetaMask).
- L'ordre des statuts n'est pas imposé (ex. `Créé → En douane` est accepté).
- Les données privées sont lisibles par tous via l'API ; il manque l'authentification côté backend.
- Pas de notification push (mail/websocket) : les alertes s'affichent dans le tableau de bord.
- Le stockage off-chain est un fichier JSON, suffisant pour une démo mais pas pour plusieurs utilisateurs simultanés.
- Testé de bout en bout sur Hardhat et sur 4 nœuds Besu (une machine). Test sur 4 machines à mener ([plan de test](test-4-machines.md)).
