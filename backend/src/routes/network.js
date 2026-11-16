// Le réseau de nœuds : échanges entre applications (rejoindre, annuaire, sonde) et écran « Réseau ».
const router = require("express").Router();
const config = require("../config");
const besu = require("../besu");
const peers = require("../peers");
const node = require("../node");
const chain = require("../chain");
const store = require("../store");
const { localOnly } = require("./setup");

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.shortMessage || e.message }));

// ───────────── Entre applications : protégé par le code d'invitation ─────────────
function member(req, res, next) {
  const c = config.get();
  if (!c || node.state.phase !== "ready") return res.status(409).json({ error: "Cette machine ne fait partie d'aucun réseau (ou démarre encore)." });
  if (String(req.body.code || "").toUpperCase() !== c.joinCode) return res.status(403).json({ error: "Code d'invitation incorrect." });
  next();
}

// Une machine rejoint le réseau, ou se ré-annonce après un redémarrage.
router.post("/join", member, (req, res) => res.json(peers.welcome(req)));

// Échange périodique : annuaire des nœuds, votes en cours de ce validateur, adresse du contrat.
router.post("/registry", member, wrap(async (req, res) => {
  res.json({ peers: peers.all(), votes: await peers.pendingVotes(), contract: config.get().contract });
}));

router.post("/leave", member, (req, res) => {
  peers.forget(String(req.body.id));
  res.json({});
});

// Une note de transport écrite sur cette machine, demandée par un autre nœud (qui en vérifiera le hash).
router.post("/note", member, (req, res) => res.json({ text: chain.ready ? store.getNote(String(req.body.hash)) : undefined }));

// Sonde : « peux-tu ouvrir une connexion vers mon port P2P ? » Répond aussi l'heure et l'adresse vue.
router.post("/probe", member, wrap(async (req, res) => {
  const ip = peers.clean(req.socket.remoteAddress);
  res.json({ reachable: await peers.tcp(ip, Number(req.body.p2pPort)), yourIp: ip, time: Date.now() });
}));

// ───────────── Écran « Réseau » ─────────────
const started = (req, res, next) => node.state.phase === "ready" ? next()
  : res.status(503).json({ error: "Le nœud de cette machine n'est pas démarré." });

router.get("/status", started, wrap(async (req, res) => {
  const c = config.get();
  const local = peers.isLocal(req);
  res.json({
    ...(await peers.status()), name: c.networkName, local,
    // L'invitation n'est montrée qu'à la personne assise devant la machine.
    invite: local ? { code: c.joinCode, addresses: besu.localIps().map((i) => `${i.ip}:${config.PORT}`), host: c.host, ips: besu.localIps() } : null,
  });
}));

router.get("/diagnose", started, wrap(async (req, res) => res.json(await peers.diagnose())));

// Gouvernance QBFT : chaque validateur vote pour ajouter (ou retirer) un validateur ; le changement
// s'applique quand plus de la moitié des validateurs ont voté dans le même sens.
router.post("/vote", localOnly, wrap(async (req, res) => {
  await besu.rpc("qbft_proposeValidatorVote", [req.body.validator, Boolean(req.body.add)]);
  res.json({ voted: true });
}));

// Retirer de l'annuaire un nœud qui ne reviendra pas (les autres machines sont prévenues).
router.post("/forget", localOnly, wrap(async (req, res) => {
  peers.forget(String(req.body.id));
  await peers.farewell(String(req.body.id));
  res.json({});
}));

router.post("/host", localOnly, wrap(async (req, res) => {
  if (!req.body.host) throw new Error("Adresse requise.");
  node.setHost(req.body.host);
  res.json({ restarting: true });
}));

// Retrouver le réseau quand toutes les adresses connues ont changé : on se ré-annonce à une adresse donnée.
router.post("/reconnect", localOnly, wrap(async (req, res) => {
  let base = String(req.body.address || "").trim();
  if (!/^https?:\/\//.test(base)) base = `http://${base}`;
  if (!new URL(base).port) base += ":3000";
  const r = await peers.announce(base, config.get().joinCode, peers.selfForAnnounce());
  peers.upsert(r.contact);
  r.peers.forEach(peers.upsert);
  await peers.maintain();
  res.json({ contacted: r.contact.name });
}));

module.exports = router;
