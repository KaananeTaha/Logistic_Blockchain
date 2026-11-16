# Suivi des décisions du debrief client

Debrief précédent avec M. Nabil Tazi : 6 décisions. État au 26/10/2026.

| # | Décision | Ce qui a été fait | Où le voir | État |
|---|---|---|---|---|
| 1 | Choisir un mécanisme de consensus et préparer un argumentaire | QBFT (Hyperledger Besu) retenu. Argumentaire : fonctionnement, avantages, limites, alternatives écartées (PoW, PoS, Clique, IBFT 2.0, Raft), réponses aux questions probables. Consensus et validateurs affichés en direct dans l'application. | [consensus.md](consensus.md), onglet Blockchain | Fait |
| 2 | Rendre visible ce qui se passe en arrière-plan à chaque étape | Panneau « Ce qui vient de se passer en coulisses » après chaque action : hachage, construction, signature, contrôles du contrat, bloc et lien avec le bloc précédent, événements, stockage hors chaîne. Les refus sont expliqués aussi. Explorateur des derniers blocs. `npm run demo -- --details` en ligne de commande. | Interface, [parcours.md](parcours.md) | Fait |
| 3 | Trouver un stockage permanent des données | Analyse des options. Retenu : nœuds Besu qui écrivent sur disque (la persistance vient de la réplication sur les 4 nœuds). Mode « 4 nœuds sur une machine » pour répéter. Données hors chaîne séparées par blockchain pour ne jamais mélanger deux chaînes. | [persistance.md](persistance.md) | Fait et **testé** : après arrêt et relance des 4 nœuds sans redéploiement, les lots sont toujours là (26/10) |
| 4 | Afficher la clé publique dans l'application | Clé publique de chaque compte dans l'onglet Comptes et en tête de chaque profil. Pour chaque transaction, la clé publique est **retrouvée à partir de la signature** et comparée à celle du compte : c'est la preuve de l'auteur. | Onglets Comptes, profils, Blockchain | Fait |
| 5 | Décrire chaque étape du parcours, à commencer par la création de compte | Création de compte réelle : clé privée → clé publique → adresse, puis attribution du rôle par le Gestionnaire (transaction on-chain). Document décrivant les 7 étapes et le cas de refus. Le scénario de démo commence par la création des comptes. | Onglet « 1. Comptes », [parcours.md](parcours.md) | Fait |
| 6 | Tester le déploiement sur 4 machines | Outil multiplateforme (macOS, Windows, Linux) pour générer le réseau, lancer un nœud par machine et vérifier l'état. Encodage du génésis validé contre l'exemple officiel de Besu. Plan de test en 11 points (connexion, panne d'un nœud, perte du quorum, persistance…). **Répétition des 4 nœuds sur une machine réussie le 26/10** : blocs toutes les 2 s, proposeur qui tourne, contrat déployé, scénario complet réussi. | [reseau.md](reseau.md), [test-4-machines.md](test-4-machines.md) | Répétition réussie, **test sur 4 machines à mener** (première tentative sans succès ; outillage refait le 16/11, voir ci-dessous) |

## Ce qui reste à faire avant le prochain debrief

1. Sur les 3 autres machines : `npm install --omit=dev`, puis un premier lancement avec Internet (l'application télécharge Java et Besu).
2. Mener le test sur 4 machines en remplissant le [plan de test](test-4-machines.md) (la répétition sur une machine est réussie).
3. Refaire le test de persistance sur les 4 machines (réussi sur une machine).

## Depuis le debrief (16/11/2026)

- **Application unique** : une commande (`npm start`) lance l'interface, l'API et le nœud. La création du réseau, l'adhésion d'une machine et la gestion des validateurs se font dans l'interface. Les scripts `network:*` et `deploy:*` ont disparu.
- **Connexion entre machines refaite** après l'échec du premier essai sur 4 machines : connexions directes entre tous les nœuds, adresse détectée automatiquement, réseau utilisable dès la première machine, diagnostic intégré. Causes et corrections : [reseau.md](reseau.md), section 3.
- **Vraie connexion des utilisateurs** : un compte par acteur, protégé par mot de passe, sur sa machine. La demande de rôle et l'annuaire passent par le Smart Contract (`requestAccess`, `getMembers`), ce qui répond à la question 2 ci-dessous par « chaque acteur crée son compte, le Gestionnaire valide ».

## Questions à poser au client

1. Les validateurs doivent-ils représenter des organisations différentes (démonstration organisationnelle), ou la démonstration technique sur 4 laptops suffit-elle ?
2. Qui doit pouvoir créer un compte : chaque acteur lui-même (puis validation du Gestionnaire, comme aujourd'hui), ou le Gestionnaire uniquement ?
3. Points restés ouverts du cahier des charges : réservation des ressources de transport et de stockage, budget de Fct7 et Fct8, profil « Auditeur » (voir [framework.md](framework.md), section 4).
