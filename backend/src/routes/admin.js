const router = require("express").Router();
const chain = require("../chain");
const { requireUser } = require("../auth");

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: chain.reason(e), steps: e.steps }));

// Chaîne, consensus et validateurs (affichés dans l'en-tête et l'onglet Blockchain).
router.get("/network", wrap(async (req, res) => res.json(await chain.networkInfo())));

// Explorateur : derniers blocs et transactions décodées, avec la clé publique de chaque signataire.
router.get("/explorer", wrap(async (req, res) => res.json(await chain.explore(Math.min(Number(req.query.count) || 10, 50)))));

// Annuaire on-chain : comptes, rôles attribués et demandes d'accès en attente.
router.get("/members", wrap(async (req, res) => res.json(await chain.members())));

// Fct4 / Fct7 : toutes les alertes émises par le contrat, les plus récentes d'abord.
router.get("/alerts", wrap(async (req, res) => {
  const events = await chain.contract.queryFilter(chain.contract.filters.AnomalyRaised(), 0);
  res.json(events.map((e) => ({
    lotId: e.args.lotId, reason: e.args.reason, timestamp: Number(e.args.timestamp), block: e.blockNumber,
  })).reverse());
}));

// Fct8 : le Gestionnaire attribue un rôle (valide une demande d'accès) ou le retire (rôle 0).
router.post("/roles", requireUser, wrap(async (req, res) => {
  const r = await chain.send(req.user.wallet, "grantRole", [req.body.address, Number(req.body.role)]);
  res.json({ txHash: r.txHash, block: r.block, steps: r.steps });
}));

module.exports = router;
