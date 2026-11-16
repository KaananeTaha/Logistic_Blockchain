// Première utilisation : créer un réseau ou en rejoindre un. Réservé au navigateur de cette machine.
const router = require("express").Router();
const config = require("../config");
const besu = require("../besu");
const node = require("../node");
const chain = require("../chain");
const { isLocal } = require("../peers");

const localOnly = (req, res, next) =>
  isLocal(req) ? next() : res.status(403).json({ error: "Cette action se fait depuis la machine elle-même (http://localhost)." });

router.get("/state", (req, res) => {
  const c = config.get();
  res.json({
    ...node.state, local: isLocal(req), synced: chain.ready,
    network: c?.networkName, node: c?.nodeName,
    // Renseignements utiles à l'assistant de configuration.
    ...(node.state.phase === "setup" ? { ips: besu.localIps(), besuInstalled: Boolean(besu.locate()), hostname: require("os").hostname().replace(/\.local$/, "") } : {}),
  });
});

// Les opérations longues (démarrage de Besu, déploiement) continuent en arrière-plan :
// l'interface suit leur progression en relisant /api/state.
router.post("/setup/create", localOnly, (req, res) => {
  if (node.state.phase !== "setup") return res.status(409).json({ error: "Cette machine fait déjà partie d'un réseau." });
  node.create(req.body);
  res.json({ started: true });
});

router.post("/setup/join", localOnly, (req, res) => {
  if (node.state.phase !== "setup") return res.status(409).json({ error: "Cette machine fait déjà partie d'un réseau." });
  node.join(req.body);
  res.json({ started: true });
});

router.post("/setup/leave", localOnly, async (req, res) => {
  await node.leave();
  res.json({ left: true });
});

module.exports = Object.assign(router, { localOnly });
