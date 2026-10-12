const router = require("express").Router();
const { contract, send, reason, provider, address } = require("../chain");
const { ROLES, walletFor } = require("../../../config/demo-accounts");

// Comptes de démo et infos réseau, affichés par l'interface.
router.get("/config", async (req, res) => {
  try {
    const net = await provider.getNetwork();
    res.json({
      contract: address,
      chainId: Number(net.chainId),
      block: await provider.getBlockNumber(),
      accounts: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { label: r.label, address: walletFor(k).address }])),
    });
  } catch (e) {
    res.status(503).json({ error: `Blockchain injoignable : ${reason(e)}` });
  }
});

// Fct4 / Fct7 : toutes les alertes émises par le contrat, les plus récentes d'abord.
router.get("/alerts", async (req, res) => {
  const events = await contract.queryFilter(contract.filters.AnomalyRaised(), 0);
  res.json(events.map((e) => ({
    lotId: e.args.lotId, reason: e.args.reason, timestamp: Number(e.args.timestamp), block: e.blockNumber,
  })).reverse());
});

// Fct8 : le gestionnaire attribue un rôle à une adresse.
router.post("/roles", async (req, res) => {
  try {
    const r = await send("manager", "grantRole", req.body.address, Number(req.body.role));
    res.json({ txHash: r.txHash });
  } catch (e) {
    res.status(400).json({ error: reason(e) });
  }
});

module.exports = router;
