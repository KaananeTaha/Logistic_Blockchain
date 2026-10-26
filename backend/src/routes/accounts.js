const router = require("express").Router();
const { ethers } = require("ethers");
const { listAccounts, send, fund, step, net, ROLE_IDS, ROLE_LABELS, defaultAccount, reason } = require("../chain");
const store = require("../store");

router.get("/", (req, res) => res.json(listAccounts()));

// Étape 1 du parcours : créer un compte. Sur une blockchain, « créer un compte » revient à générer
// une paire de clés ; aucune inscription n'est nécessaire. Ce qui donne des droits, c'est le rôle
// que le Gestionnaire inscrit ensuite dans le Smart Contract.
router.post("/", async (req, res) => {
  const { name, role } = req.body;
  if (!name || !ROLE_IDS[role] || role === "manager") {
    return res.status(400).json({ error: "Nom et rôle (Fournisseur, Transporteur ou Destinataire) requis." });
  }

  const wallet = ethers.Wallet.createRandom();
  const publicKey = wallet.signingKey.publicKey;
  const steps = [
    step("Clé privée générée",
      `256 bits tirés au hasard : ${wallet.privateKey.slice(0, 6)}…${wallet.privateKey.slice(-4)} (masquée).\n` +
      "Elle sert à signer ; quiconque la possède agit au nom du compte."),
    step("Clé publique calculée",
      `Dérivée de la clé privée par la courbe elliptique secp256k1 (calcul à sens unique) :\n${publicKey}`),
    step("Adresse calculée",
      `keccak256(clé publique) = ${ethers.keccak256("0x" + publicKey.slice(4))}\n` +
      `L'adresse est faite des 20 derniers octets : ${wallet.address}`),
  ];

  try {
    store.addAccount({ name, role, address: wallet.address, publicKey, privateKey: wallet.privateKey, createdAt: Date.now() });
    if (!net.freeGas) {
      await fund(wallet.address);
      steps.push(step("Compte approvisionné en ETH de test",
        "Sur ce réseau chaque transaction coûte du gaz : le Gestionnaire envoie 10 ETH de test. (Inutile sur le réseau Besu, où le gaz est gratuit.)"));
    }
    steps.push(step("Demande de rôle transmise au Gestionnaire",
      `Le compte existe mais n'a encore aucun droit. Le Gestionnaire lui attribue le rôle « ${ROLE_LABELS[role]} ».`));
    const r = await send(defaultAccount("manager"), "grantRole", [wallet.address, ROLE_IDS[role]], { before: steps });
    res.json({ address: wallet.address, publicKey, txHash: r.txHash, block: r.block, steps: r.steps });
  } catch (e) {
    res.status(400).json({ error: reason(e), steps: e.steps || steps });
  }
});

module.exports = router;
