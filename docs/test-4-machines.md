# Plan de test : déploiement sur 4 machines

*Décision du debrief : « tester le déploiement sur 4 machines ».*

Tout se fait depuis l'application ([README](../README.md#lancer-lapplication), [reseau.md](reseau.md)). Remplir la colonne « Résultat » pendant le test et l'apporter au prochain debrief.

## Préparation

| Machine | Membre | Système | Node 18+ | `npm install --omit=dev` fait | Adresse IP |
|---|---|---|---|---|---|
| 1 (crée le réseau) | | | ☐ | ☐ | |
| 2 | | | ☐ | ☐ | |
| 3 | | | ☐ | ☐ | |
| 4 | | | ☐ | ☐ | |

- Les 4 machines sur le même réseau. **Éviter le Wi-Fi de l'école** s'il isole les appareils : partage de connexion d'un téléphone, ou Tailscale.
- Chaque machine lance une première fois l'application **avec Internet** pour télécharger Java et Besu (environ 250 Mo). On peut le faire la veille : créer un réseau d'essai seul, puis Réseau > Quitter le réseau.
- Date et heure en réglage automatique sur les 4 machines.

Conseil : faire d'abord la répétition sur une seule machine (test 0), pour séparer les problèmes d'installation des problèmes de réseau.

## Tests

| # | Test | Procédure | Résultat attendu | Résultat |
|---|---|---|---|---|
| 0 | Répétition locale | 4 instances sur une machine ([README](../README.md#répéter-sur-une-seule-machine)), puis tests 1 à 9 | Identique aux attentes ci-dessous | **Réussi le 16/11** (MacBook, macOS 12, Besu 26.10.2) |
| 1 | Création | Machine 1 : `npm start`, « Créer un réseau » | Nœud démarré, contrat déployé, connexion du Gestionnaire possible ; onglet Réseau : 1 validateur, adresse et code d'invitation affichés | |
| 2 | Adhésion | Machines 2, 3, 4 : « Rejoindre un réseau » avec l'adresse et le code. Faire rejoindre la machine 4 **via la machine 2** | Sur chaque machine : 3 pairs connectés, même numéro de bloc, bandeau de synchronisation disparu | |
| 3 | Diagnostic | Sur chaque machine : Réseau > Diagnostiquer les connexions | « Connecté » pour les 3 autres. Noter les ✗ éventuels dans la colonne « port entrant » (pare-feu) | |
| 4 | Validateurs | Machine 1 vote pour 2 ; machines 1 et 2 votent pour 3 ; deux validateurs votent pour 4 | Onglet Réseau : 4 validateurs, « tolère 1 panne » ; dans l'onglet Blockchain, la machine qui propose change d'un bloc à l'autre | |
| 5 | Comptes | Machines 2, 3, 4 : créer un compte Fournisseur, Transporteur, Destinataire. Machine 1 : valider les demandes | Les demandes apparaissent chez le Gestionnaire sans action de sa part ; l'onglet du rôle apparaît sur chaque machine | |
| 6 | Réplication | Dérouler le scénario du [README](../README.md#scénario-de-démonstration), chaque acteur sur sa machine. Ou : `npm run demo -- … --apis …` depuis la machine 1 | Lot, étapes, mesures et litige visibles sur les 4 machines. Notes de transport lisibles partout. Données privées visibles seulement chez le Fournisseur | |
| 7 | Panne d'un nœud | Fermer l'application de la machine 4, puis faire une action | L'action réussit (3 validateurs sur 4) ; machine 4 affichée « Non connecté » | |
| 8 | Retour du nœud | Relancer la machine 4 | Elle rattrape les blocs manqués et retrouve ses 3 pairs sans aucune saisie | |
| 9 | Perte du quorum | Fermer les machines 3 et 4, tenter une action ; les relancer après 3 minutes | « En pause » dans l'onglet Réseau, l'action reste en attente, aucune donnée incohérente. Au retour : reprise en une à deux minutes | |
| 10 | Persistance | Fermer les 4 applications, puis tout relancer | Lots, historique, comptes et rôles toujours présents ; chaque utilisateur se reconnecte avec son mot de passe | |
| 11 | Changement d'adresse | Changer une machine de réseau (ou couper puis rétablir son Wi-Fi), relancer son application | Elle se ré-annonce et retrouve ses pairs ; sinon Réseau > « Retrouver le réseau via l'adresse d'une machine » | |
| 12 | Intégrité | Sur la machine du Fournisseur, modifier un prix dans `app-data/offchain/*.json` | La page du lot affiche « Données off-chain MODIFIÉES » | |
| 13 | Accès sans nœud | Depuis un téléphone sur le même réseau : scanner le QR Code d'un lot | La page de traçabilité s'ouvre | |
| 14 | Installation automatique | Sur une machine Windows sans Java ni Besu : premier lancement | Java et Besu téléchargés dans `app-data/tools/`, nœud démarré | |

En cas de blocage : [reseau.md, section Dépannage](reseau.md#dépannage).

## À rapporter au client

- Tableau ci-dessus rempli.
- Captures : onglet Réseau avec les 4 validateurs, résultat du diagnostic, onglet Blockchain (proposeurs qui alternent), test 7 réussi.
- Problèmes rencontrés et solutions.
