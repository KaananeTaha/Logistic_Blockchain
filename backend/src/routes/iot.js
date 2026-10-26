const router = require("express").Router();
const { send, step, reason, defaultAccount } = require("../chain");

// Fct3 : passerelle IoT. Les capteurs (ou scripts/iot-simulator.js) envoient ici leurs mesures ;
// la passerelle les signe avec le compte du Transporteur. Les seuils sont vérifiés par le contrat.
router.post("/:lotId", async (req, res) => {
  const { temperature, lat, lon } = req.body; // °C et degrés décimaux
  const before = [step("Mesure reçue du capteur par la passerelle IoT",
    `${temperature} °C à (${lat}, ${lon}).\nUn capteur ne sait pas signer : la passerelle signe pour le compte du transporteur.`)];
  try {
    const r = await send(req.body.account || defaultAccount("carrier"), "recordSensorData", [
      req.params.lotId, Math.round(temperature * 10), Math.round(lat * 1e6), Math.round(lon * 1e6),
    ], { before });
    const anomalies = r.events.filter((e) => e.name === "AnomalyRaised").map((e) => e.args.reason);
    res.json({ txHash: r.txHash, block: r.block, anomalies, steps: r.steps });
  } catch (e) {
    res.status(400).json({ error: reason(e), steps: e.steps });
  }
});

module.exports = router;
