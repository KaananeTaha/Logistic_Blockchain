# Réseau : nœuds, comptes et connexion entre machines

Ce document explique comment une machine entre dans le réseau, comment une personne s'y connecte, et ce que fait l'application pour que les machines se trouvent. Le choix du consensus est défendu dans [consensus.md](consensus.md) ; le plan de test est dans [test-4-machines.md](test-4-machines.md).

## 1. Un seul écran, deux identités

La question de départ : un seul « login » suffit-il ? Chaque utilisateur est-il un nœud ?

**Non : il y a deux identités, parce qu'il y a deux responsabilités.** L'application les réunit dans une seule interface, mais ne les confond pas.

| | Identité du **nœud** | Identité de l'**utilisateur** |
|---|---|---|
| Représente | Une machine (en pratique : une organisation qui héberge une copie de la chaîne) | Une personne ou un service qui agit dans la chaîne logistique |
| Clé | `app-data/nodekey`, créée au premier lancement, jamais saisie | Paire de clés chiffrée par mot de passe dans `app-data/keystore/` |
| Entre dans le réseau | Une fois, avec l'adresse d'un membre et le code d'invitation | À chaque session, avec son mot de passe |
| Ses droits | Relayer et stocker ; voter sur les blocs s'il est **validateur** | Ceux de son **rôle** dans le Smart Contract (Fournisseur, Transporteur, Gestionnaire, Destinataire) |
| Qui les accorde | Les validateurs en place, par vote à la majorité (QBFT) | Le Gestionnaire, par la transaction `grantRole` |
| Signe | Les blocs, et la vérification automatique des délais | Les transactions métier |

Trois situations en découlent, toutes prises en charge :

1. **Nœud sans utilisateur.** Une machine laissée allumée, application ouverte, personne de connecté : elle valide les blocs et constate les retards. C'est le « nœud qui ne fait qu'ajouter des blocs ».
2. **Nœud avec utilisateurs.** Le cas normal : une organisation héberge son nœud, ses employés s'y connectent. Plusieurs comptes peuvent exister sur la même machine.
3. **Utilisateur sans nœud.** Un téléphone ou un poste léger ouvre `http://<IP d'un nœud>:3000` dans son navigateur. Il consulte, crée un compte et signe, sans contribuer au réseau. Son compte est conservé, chiffré, par la machine qu'il utilise.

Pourquoi ne pas fusionner les deux ? Parce que le nombre de validateurs doit rester petit (chaque validateur échange des messages avec tous les autres à chaque bloc), alors que le nombre d'utilisateurs n'a pas de limite ; et parce qu'un destinataire ou un auditeur ne doit pas être obligé d'héberger une infrastructure pour consulter un lot.

## 2. Ce que fait l'application quand une machine rejoint

1. La machine crée sa clé de nœud et choisit ses ports.
2. Elle contacte l'application d'un membre (`http://adresse:3000`) avec le code d'invitation. Elle reçoit le bloc génésis, l'adresse du contrat et l'annuaire des nœuds déjà connus.
3. Le membre note l'adresse IP **d'où vient réellement la requête** : c'est celle-là qui est annoncée aux autres nœuds, pas une adresse saisie à la main.
4. Le nœud Besu démarre avec tous les nœuds connus comme points d'entrée.
5. Toutes les 10 secondes, chaque application échange son annuaire avec les autres et demande à son nœud d'ouvrir une connexion directe (`admin_addPeer`) vers chaque nœud connu mais non connecté.
6. Le nœud télécharge la chaîne. Dès que le contrat est visible, les comptes et les lots apparaissent.

À chaque redémarrage, la machine se ré-annonce : si son adresse IP a changé (autre Wi-Fi, DHCP), les autres l'apprennent.

## 3. Pourquoi la connexion à 4 machines avait échoué, et ce qui a changé

L'ancien outillage (`scripts/network.js`) reposait sur plusieurs points fragiles. Aucun n'apparaissait dans la répétition sur une seule machine.

| Point fragile de l'ancienne version | Conséquence sur 4 machines | Maintenant |
|---|---|---|
| Les nœuds 2 à 4 ne connaissaient que le nœud 1 et comptaient sur la **découverte UDP** pour se trouver entre eux | Un pare-feu ou un Wi-Fi qui filtre l'UDP laissait chaque nœud avec 0 ou 1 pair ; or il faut 3 validateurs connectés sur 4 pour produire un bloc | Chaque nœud connaît tous les autres et ouvre des connexions **TCP directes**. Il suffit qu'une des deux machines d'une paire accepte les connexions entrantes |
| Adresse IP **saisie à la main** (`--ip`, `--bootnode`) | Une mauvaise interface (VPN, adresse d'hier) et le nœud annonce une adresse injoignable | Adresse détectée : celle que les autres machines voient. Réglable dans l'onglet Réseau |
| Les **4 validateurs fixés dans le génésis** | Rien ne fonctionnait tant que 3 machines n'étaient pas connectées : impossible de savoir laquelle posait problème | Le réseau démarre avec 1 validateur et fonctionne tout de suite ; les autres rejoignent une à une, puis sont promues par vote |
| `genesis.json`, `nodes.json`, les clés privées et `deployment.json` à **copier à la main** sur chaque machine | Un fichier manquant ou différent, et le nœud démarre sur une autre chaîne ou le serveur refuse de se lancer | Tout est transmis par l'application au moment de rejoindre. Les clés privées ne circulent plus : chaque machine crée la sienne |
| Liste de pairs passée à Besu au démarrage (`--bootnodes`) | Sous Windows, Besu lit chaque valeur comme un chemin de fichier : erreur « Illegal char <:> at index 5 », même dans un fichier de configuration | Plus aucune liste de pairs au démarrage : l'application les ajoute au nœud une fois lancé (`admin_addPeer`), de la même façon sur tous les systèmes |
| Le RPC de chaque nœud ouvert à tout le réseau local | Un port de plus à autoriser dans chaque pare-feu | Le RPC n'écoute que sur la machine ; seuls les ports 3000 (application) et 30303 (nœud) comptent |
| Aucun diagnostic : « 0 pair » sans explication | Impossible de distinguer pare-feu, mauvaise IP et Wi-Fi isolant | Bouton **Diagnostiquer les connexions** : pour chaque machine, application joignable ? port sortant ? port entrant ? horloges ? et la cause probable |
| Java 25 et Besu à installer sur chaque machine | Étape manuelle, différente selon le système | Téléchargés par l'application au premier démarrage |

Ce que le logiciel ne peut pas contourner : un réseau qui **interdit aux appareils de se parler** (isolation des clients, fréquente sur les Wi-Fi d'école, d'entreprise ou publics). Le diagnostic le signale ; la solution est un partage de connexion depuis un téléphone, un routeur à soi, ou un VPN comme Tailscale (l'application propose alors l'adresse 100.x.y.z du VPN).

## 4. Ports et pare-feu

| Port | Usage | À autoriser en entrée |
|---|---|---|
| 3000 TCP | Application (interface, et échanges entre applications) | Oui, sur chaque machine (programme : Node.js) |
| 30303 TCP et UDP | Nœud Besu (pair-à-pair) | Sur au moins une machine de chaque paire ; idéalement toutes (programme : Java) |
| 8545 TCP | JSON-RPC du nœud | Non : local à la machine |

- **Windows** : au premier lancement, deux fenêtres « Autoriser l'accès » apparaissent (Node.js, puis Java). Cocher réseaux **privés et publics**, puis Autoriser.
- **macOS** : si le coupe-feu est activé, accepter les connexions entrantes pour `node` et `java` quand la question est posée.

## 5. Validateurs

- Un **validateur** vote sur chaque bloc. Un bloc est accepté par ⌈2N/3⌉ validateurs : 1 sur 1, 2 sur 2, 2 sur 3, 3 sur 4.
- Un simple **nœud** garde la chaîne et relaie les transactions sans voter. Il ne ralentit pas le consensus.
- Ajouter ou retirer un validateur se fait par vote, dans l'onglet Réseau de chaque validateur (action réservée à la personne assise devant la machine). Le changement s'applique quand **plus de la moitié** des validateurs ont voté dans le même sens ; l'onglet affiche les votes déjà exprimés.
- Passez de 1 à 4 validateurs d'une traite, quand les 4 machines sont connectées : avec 2 validateurs il faut les 2, avec 3 il en faut 2. À 4, une panne est tolérée.
- Si le quorum est perdu, la production de blocs s'arrête (aucune donnée n'est perdue ni incohérente) et reprend au retour des validateurs. Après une longue coupure, les validateurs restés allumés attendent de plus en plus longtemps entre deux tentatives (le délai QBFT double à chaque tour) : l'application redémarre alors automatiquement leur nœud pour repartir de zéro. La reprise prend une à deux minutes.

## 6. Répéter sur une seule machine

Voir le [README](../README.md#répéter-sur-une-seule-machine). Lancez les instances une par une et, dans l'assistant, rejoignez `127.0.0.1:3000`. Les ports sont choisis automatiquement (30303, 30304… et 8545, 8546…).

## Dépannage

Commencez toujours par **Réseau > Diagnostiquer les connexions**, sur la machine qui pose problème.

| Symptôme | Cause probable et solution |
|---|---|
| « Impossible de joindre … » en rejoignant | Mauvaise adresse ; application non lancée sur la machine contactée ; Node.js bloqué par son pare-feu ; ou réseau qui isole les appareils. Test rapide : ouvrir `http://<adresse>:3000` dans le navigateur de la machine qui veut rejoindre |
| « Code d'invitation incorrect » | Le code est celui affiché dans l'onglet Réseau d'une machine déjà membre |
| Le diagnostic indique : application ✓, port sortant ✗, port entrant ✗ | Java est bloqué par le pare-feu des deux machines : l'autoriser sur au moins l'une des deux |
| « Ce nœud nous voit à l'adresse X, mais nous annonçons Y » | Changer l'adresse annoncée dans Réseau > Réglages de cette machine (le nœud redémarre) |
| Toutes les machines ont changé d'adresse (nouveau lieu) | Sur chacune : Réseau > « Retrouver le réseau via l'adresse d'une machine », en donnant la nouvelle adresse d'un membre |
| « Les horloges diffèrent de N s » | Passer la date et l'heure en réglage automatique : QBFT refuse les blocs datés du futur |
| Une machine reste « Nœud » après les votes | Il manque des votes (affichés dans le tableau), ou les validateurs qui ont voté ne sont pas tous en ligne |
| Un ancien nœud reste affiché « Non connecté » | Bouton **Oublier** s'il ne reviendra pas |
| Le nœud ne démarre pas | Le message d'erreur reprend les dernières lignes de `app-data/besu.log`. Port occupé : un autre Besu tourne déjà sur la machine |
| Machine très lente | Chaque nœud utilise jusqu'à 1 Go de mémoire (`BESU_OPTS=-Xmx1g` par défaut) |
