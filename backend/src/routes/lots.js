const router = require("express").Router();
const QRCode = require("qrcode");
const { ethers } = require("ethers");
const { contract, send, step, reason, plain, readLot, describe, defaultAccount, STATUS } = require("../chain");
const store = require("../store");

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => res.status(400).json({ error: reason(e), steps: e.steps }));

// Compte qui signe : celui choisi dans l'interface, sinon le compte de démo du rôle attendu.
const signer = (req, role) => req.body.account || defaultAccount(role);

const reply = (res, r, extra = {}) =>
  res.json({ txHash: r.txHash, block: r.block, events: r.events.map((e) => e.name), steps: r.steps, ...extra });

// Liste de tous les lots (dashboard, listes déroulantes).
router.get("/", wrap(async (req, res) => {
  const ids = await contract.getLotIds();
  res.json(await Promise.all(ids.map(readLot)));
}));

// Fct1 : le fournisseur crée un lot. Les données privées restent off-chain, seul leur hash est publié.
router.post("/", wrap(async (req, res) => {
  const b = req.body;
  const privateData = b.privateData || {};
  const dataHash = store.hashOf(privateData);
  const now = Math.floor(Date.now() / 1000);
  const before = [step("Données privées hachées",
    `${JSON.stringify(privateData)}\nkeccak256(JSON trié) = ${dataHash}\nSeul ce hash part sur la blockchain ; les données restent sur le serveur de l'entreprise.`)];

  const r = await send(signer(req, "supplier"), "createLot", [
    b.nature, Number(b.quantity), now,
    Math.round(b.minTemp * 10), Math.round(b.maxTemp * 10),
    now + Math.round(b.deadlineMinutes * 60),
    b.recipient || defaultAccount("recipient"), dataHash,
  ], { before });

  const lotId = r.events.find((e) => e.name === "LotCreated").args.lotId;
  store.savePrivate(lotId, privateData);
  r.steps.push(step("Données privées enregistrées hors chaîne",
    `Fichier ${store.file()}, indexées par l'identifiant du lot.\nLe QR Code imprimé sur le colis contient cet identifiant : ${lotId}`));
  reply(res, r, { lotId });
}));

// Fct5 : traçabilité complète d'un lot (ce qu'affiche la page ouverte par le QR Code).
router.get("/:id", wrap(async (req, res) => {
  const id = req.params.id;
  const lot = await readLot(id);
  const history = plain(await contract.getHistory(id)).map(([status, actor, timestamp, noteHash]) => ({
    status, statusLabel: STATUS[status], actor, actorName: describe(actor)?.name, timestamp,
    note: noteHash === ethers.ZeroHash ? null : store.getNote(noteHash) ?? "(note introuvable off-chain)",
  }));
  const readings = (await contract.queryFilter(contract.filters.SensorReading(id), 0)).map((e) => ({
    temperature: Number(e.args.temperature) / 10,
    lat: Number(e.args.lat) / 1e6,
    lon: Number(e.args.lon) / 1e6,
    timestamp: Number(e.args.timestamp),
  }));
  const anomalies = (await contract.queryFilter(contract.filters.AnomalyRaised(id), 0)).map((e) => ({
    reason: e.args.reason, timestamp: Number(e.args.timestamp),
  }));

  // Intégrité : on recalcule le hash des données off-chain et on le compare à celui de la blockchain.
  const privateData = store.getPrivate(id);
  const integrity = privateData === undefined ? "missing"
    : store.hashOf(privateData) === lot.dataHash ? "ok" : "tampered";

  res.json({
    lot: { ...lot, supplierName: describe(lot.supplier)?.name, recipientName: describe(lot.recipient)?.name },
    history, readings, anomalies, privateData, integrity,
  });
}));

// Fct1 : QR Code pointant vers la page publique de traçabilité.
router.get("/:id/qrcode", wrap(async (req, res) => {
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  res.type("png").send(await QRCode.toBuffer(`${base}/lot.html?id=${req.params.id}`, { width: 260, margin: 1 }));
}));

// Fct2 : le transporteur scanne le lot et met à jour son statut.
router.post("/:id/status", wrap(async (req, res) => {
  const before = [];
  let noteHash = ethers.ZeroHash;
  if (req.body.note) {
    noteHash = store.saveNote(req.body.note);
    before.push(step("Note hachée et stockée hors chaîne", `« ${req.body.note} »\nkeccak256 = ${noteHash} (seul ce hash est inscrit)`));
  }
  reply(res, await send(signer(req, "carrier"), "updateStatus", [req.params.id, Number(req.body.status), noteHash], { before }));
}));

// Fct6 : le destinataire signe la réception conforme...
router.post("/:id/deliver", wrap(async (req, res) => {
  reply(res, await send(signer(req, "recipient"), "confirmDelivery", [req.params.id]));
}));

// ...ou refuse la livraison et ouvre un litige.
router.post("/:id/dispute", wrap(async (req, res) => {
  const text = req.body.reason || "Litige sans motif";
  const reasonHash = store.saveNote(text);
  const before = [step("Motif haché et stocké hors chaîne", `« ${text} »\nkeccak256 = ${reasonHash}`)];
  reply(res, await send(signer(req, "recipient"), "raiseDispute", [req.params.id, reasonHash], { before }));
}));

// Fct8 : le gestionnaire ajuste les règles du Smart Contract pour ce lot.
router.post("/:id/rules", wrap(async (req, res) => {
  const b = req.body;
  const deadline = Math.floor(Date.now() / 1000) + Math.round(b.deadlineMinutes * 60);
  reply(res, await send(signer(req, "manager"), "setRules",
    [req.params.id, Math.round(b.minTemp * 10), Math.round(b.maxTemp * 10), deadline]));
}));

module.exports = router;
