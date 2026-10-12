const router = require("express").Router();
const { send, reason } = require("../chain");

// Fct3 : passerelle IoT. Les capteurs (ou scripts/iot-simulator.js) envoient ici leurs mesures ;
// la passerelle les signe avec le compte Transporteur. Les seuils sont vérifiés par le contrat.
router.post("/:lotId", async (req, res) => {
  const { temperature, lat, lon } = req.body; // °C et degrés décimaux
  try {
    const r = await send("carrier", "recordSensorData", req.params.lotId,
      Math.round(temperature * 10), Math.round(lat * 1e6), Math.round(lon * 1e6));
    const anomalies = r.events.filter((e) => e.name === "AnomalyRaised").map((e) => e.args.reason);
    res.json({ txHash: r.txHash, block: r.block, anomalies });
  } catch (e) {
    res.status(400).json({ error: reason(e) });
  }
});

module.exports = router;
