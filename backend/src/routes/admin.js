const router = require("express").Router();
const { contract, send, reason, networkInfo, explore, defaultAccount } = require("../chain");

// Réseau, consensus et validateurs (affichés dans l'en-tête et l'onglet Blockchain).
router.get("/network", async (req, res) => {
  try {
    res.json(await networkInfo());
  } catch (e) {
    res.status(503).json({ error: `Blockchain injoignable : ${reason(e)}` });
  }
});

// Explorateur : derniers blocs et transactions décodées, avec la clé publique de chaque signataire.
router.get("/explorer", async (req, res) => {
  try {
    res.json(await explore(Math.min(Number(req.query.count) || 10, 50)));
  } catch (e) {
    res.status(503).json({ error: reason(e) });
  }
});

// Fct4 / Fct7 : toutes les alertes émises par le contrat, les plus récentes d'abord.
router.get("/alerts", async (req, res) => {
  const events = await contract.queryFilter(contract.filters.AnomalyRaised(), 0);
  res.json(events.map((e) => ({
    lotId: e.args.lotId, reason: e.args.reason, timestamp: Number(e.args.timestamp), block: e.blockNumber,
  })).reverse());
});

// Fct8 : le gestionnaire attribue un rôle à une adresse existante.
router.post("/roles", async (req, res) => {
  try {
    const r = await send(req.body.account || defaultAccount("manager"), "grantRole", [req.body.address, Number(req.body.role)]);
    res.json({ txHash: r.txHash, block: r.block, steps: r.steps });
  } catch (e) {
    res.status(400).json({ error: reason(e), steps: e.steps });
  }
});

module.exports = router;
