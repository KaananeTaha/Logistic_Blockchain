// Connexion des utilisateurs. S'inscrire = générer une paire de clés sur cette machine, puis demander
// un rôle au Gestionnaire par une transaction (étape 1 du parcours).
const router = require("express").Router();
const { ethers } = require("ethers");
const auth = require("../auth");
const { requireUser } = auth;
const chain = require("../chain");

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: chain.reason(e), steps: e.steps }));

router.get("/me", wrap(async (req, res) => {
  const s = auth.current(req);
  let user = null;
  if (s) {
    const m = chain.ready ? await chain.describe(s.wallet.address) : null;
    user = { address: s.wallet.address, publicKey: s.wallet.signingKey.publicKey, name: m?.name || s.name, role: m?.role || null, requested: m?.requested || null };
  }
  res.json({ user, accounts: auth.list().map(({ name, address }) => ({ name, address })) });
}));

router.post("/register", wrap(async (req, res) => {
  const { name, role, password } = req.body;
  if (!chain.ready) throw new Error("Ce nœud n'est pas encore synchronisé avec le réseau : impossible d'envoyer la demande de rôle.");
  if (!chain.ROLE_IDS[role]) throw new Error("Rôle demandé invalide.");
  if (auth.list().some((a) => a.name.toLowerCase() === String(name).trim().toLowerCase())) throw new Error("Un compte porte déjà ce nom sur cette machine.");

  const wallet = await auth.create(name, password);
  const publicKey = wallet.signingKey.publicKey;
  const steps = [
    chain.step("Clé privée générée",
      `256 bits tirés au hasard : ${wallet.privateKey.slice(0, 6)}…${wallet.privateKey.slice(-4)} (masquée).\n` +
      "Elle sert à signer ; quiconque la possède agit au nom du compte."),
    chain.step("Clé publique calculée",
      `Dérivée de la clé privée par la courbe elliptique secp256k1 (calcul à sens unique) :\n${publicKey}`),
    chain.step("Adresse calculée",
      `keccak256(clé publique) = ${ethers.keccak256("0x" + publicKey.slice(4))}\n` +
      `L'adresse est faite des 20 derniers octets : ${wallet.address}`),
    chain.step("Clé privée chiffrée et enregistrée sur cette machine",
      "Chiffrée avec votre mot de passe (scrypt + AES-128-CTR, format keystore d'Ethereum).\n" +
      "Elle n'est jamais envoyée sur le réseau ; sans le mot de passe, le fichier est inutilisable."),
    chain.step("Demande d'accès envoyée au Smart Contract",
      `Le compte existe mais n'a encore aucun droit. Il se présente (« ${name.trim()} ») et demande le rôle ` +
      `« ${chain.ROLE_LABELS[role]} ». Le Gestionnaire verra la demande sur sa propre machine et décidera.`),
  ];
  auth.open(res, wallet, name.trim());
  const r = await chain.send(wallet, "requestAccess", [chain.ROLE_IDS[role], name.trim()], { before: steps });
  res.json({ address: wallet.address, publicKey, txHash: r.txHash, block: r.block, steps: r.steps });
}));

// Redemander un rôle (première demande refusée, ou changement d'activité).
router.post("/request", requireUser, wrap(async (req, res) => {
  if (!chain.ROLE_IDS[req.body.role]) throw new Error("Rôle demandé invalide.");
  const r = await chain.send(req.user.wallet, "requestAccess", [chain.ROLE_IDS[req.body.role], req.user.name]);
  res.json({ txHash: r.txHash, block: r.block, steps: r.steps });
}));

router.post("/login", wrap(async (req, res) => {
  const { wallet, name } = await auth.unlock(req.body.account, req.body.password);
  res.json({ address: wallet.address, name, token: auth.open(res, wallet, name) });
}));

router.post("/logout", (req, res) => {
  auth.close(req, res);
  res.json({});
});

module.exports = router;
