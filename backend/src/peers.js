// Annuaire des nœuds du réseau et tout ce qui sert à se connecter entre machines.
//
// Principe : chaque application connaît la liste des nœuds (identifiant, adresse IP, ports) et la
// partage avec les autres. Pour chaque nœud connu mais non connecté, elle demande à Besu d'ouvrir
// une connexion TCP directe (admin_addPeer). La découverte automatique (UDP) reste active mais
// n'est plus indispensable, et il suffit qu'UN des deux nœuds d'une paire accepte les connexions
// entrantes : un pare-feu sur une machine ne bloque plus le réseau.
const fs = require("fs");
const net = require("net");
const dns = require("dns").promises;
const config = require("./config");
const besu = require("./besu");

const TIMEOUT = 4000;
const clean = (ip) => { // adresse vue par le serveur HTTP -> IPv4 simple
  const a = String(ip || "").replace(/^::ffff:/, "");
  return a === "::1" ? "127.0.0.1" : a;
};
const isLocal = (req) => ["127.0.0.1"].includes(clean(req.socket.remoteAddress));
const enode = (p) => `enode://${p.id}@${p.host}:${p.p2pPort}`;
const appUrl = (p) => `http://${p.host}:${p.appPort}`;

function self() {
  const c = config.get();
  const me = besu.identity();
  return { id: me.id, validator: me.validator, name: c.nodeName, host: c.host, p2pPort: c.p2pPort, appPort: config.PORT };
}

// Les nœuds partis restent dans le fichier avec la marque `gone` : sans cela, l'annuaire d'un autre
// nœud les ferait réapparaître au prochain échange.
const others = () => (config.get().peers || []).filter((p) => !p.gone);

// Ajoute ou met à jour une fiche. L'information la plus récente gagne (une machine qui change
// d'adresse IP se ré-annonce au démarrage).
function upsert(entry) {
  if (!entry?.id || entry.id === besu.identity().id) return;
  const peers = (config.get().peers || []).slice();
  const i = peers.findIndex((p) => p.id === entry.id);
  if (i >= 0 && (peers[i].seen || 0) >= (entry.seen || 0)) return;
  const fresh = { id: entry.id, validator: entry.validator, name: String(entry.name || "").slice(0, 40), host: entry.host,
    p2pPort: Number(entry.p2pPort), appPort: Number(entry.appPort), seen: entry.seen || Date.now(), ...(entry.gone ? { gone: true } : {}) };
  if (i >= 0) peers[i] = fresh; else peers.push(fresh);
  config.save({ peers });
}

async function call(base, path, body) {
  const r = await fetch(`${base}/api/network/${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: config.get()?.joinCode, ...body }), signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ───────────── Côté machine déjà membre ─────────────
// Une machine se présente (première connexion ou simple ré-annonce). L'adresse retenue pour elle est
// celle d'où vient réellement sa requête : c'est par définition une adresse joignable d'ici, ce qui
// évite les erreurs de saisie d'IP.
function welcome(req) {
  const c = config.get();
  const ip = clean(req.socket.remoteAddress);
  const node = req.body.node;
  if (node) {
    upsert({ ...node, host: ip, seen: Date.now() });
    besu.rpc("admin_addPeer", [enode({ ...node, host: ip })]).catch(() => {});
  }
  const { host, ...me } = self();
  return {
    network: { name: c.networkName, contract: c.contract, genesis: JSON.parse(fs.readFileSync(config.paths.genesis, "utf8")) },
    me, peers: all().filter((p) => p.id !== node?.id), yourIp: ip, time: Date.now(),
  };
}

// Un nœud quitte le réseau : il prévient les autres, qui cessent de le chercher.
function forget(id) {
  const p = (config.get().peers || []).find((x) => x.id === id);
  if (p) upsert({ ...p, gone: true, seen: Date.now() });
  besu.rpc("admin_removePeer", [enode(p || { id, host: "127.0.0.1", p2pPort: 0 })]).catch(() => {});
}

async function farewell(id = besu.identity().id) {
  await Promise.all(others().map((p) => call(appUrl(p), "leave", { id }).catch(() => {})));
}

// ───────────── Côté machine qui rejoint ou se ré-annonce ─────────────
// `base` : adresse de l'application d'un membre, ex. http://192.168.1.12:3000
async function announce(base, code, node) {
  const t0 = Date.now();
  const r = await call(base, "join", { code, node });
  const u = new URL(base);
  // Le membre contacté est enregistré à l'adresse qu'on vient d'utiliser pour le joindre.
  // Besu n'accepte que des adresses IP : un nom de machine (localhost, portable.local…) est résolu ici.
  const { address: host } = await dns.lookup(u.hostname, { family: 4 });
  const contact = { ...r.me, host, appPort: Number(u.port) || 80, seen: Date.now() };
  return { ...r, contact, skewMs: r.time - (t0 + Date.now()) / 2 };
}

// Au démarrage : se ré-annoncer à tous les nœuds connus et récupérer notre adresse telle qu'ils la voient.
async function reannounce() {
  let seenAs = null;
  await Promise.all(others().map(async (p) => {
    try {
      const r = await announce(appUrl(p), config.get().joinCode, selfForAnnounce());
      upsert(r.contact);
      r.peers.forEach(upsert);
      if (r.yourIp !== "127.0.0.1" || !seenAs) seenAs = r.yourIp; // une adresse réseau prime sur la boucle locale
    } catch {}
  }));
  return seenAs;
}

const all = () => config.get().peers || []; // y compris les nœuds partis, pour propager leur départ

function selfForAnnounce() {
  const { host, ...me } = self();
  return me;
}

// ───────────── Entretien (toutes les 10 s) ─────────────
const votesSeen = {}; // id du nœud -> { validator, votes: { adresse: true|false } }

async function connectedIds() {
  const list = await besu.rpc("admin_peers");
  return new Set(list.map((p) => String(p.id).replace(/^0x/, "")));
}

async function maintain() {
  // 1. Échanger les annuaires et les votes en cours avec les applications des autres nœuds.
  await Promise.all(others().map(async (p) => {
    try {
      const r = await call(appUrl(p), "registry", {});
      // On garde pour `p` l'adresse à laquelle on vient de le joindre, pas celle qu'un tiers rapporte.
      r.peers.filter((x) => x.id !== p.id).forEach(upsert);
      votesSeen[p.id] = { validator: p.validator, votes: r.votes };
      // Machine arrivée avant la fin du déploiement : elle apprend l'adresse du contrat ici.
      if (!config.get().contract && r.contract) config.save({ contract: r.contract });
    } catch {}
  }));
  // 2. Reconnecter les nœuds connus qui ne sont pas des pairs en ce moment.
  const connected = await connectedIds();
  for (const p of others()) {
    if (!connected.has(p.id)) await besu.rpc("admin_addPeer", [enode(p)]).catch(() => {});
  }
  // 3. Retirer nos votes déjà appliqués (sinon ils resteraient « en cours » indéfiniment).
  const [validators, pending] = await Promise.all([getValidators(), besu.rpc("qbft_getPendingVotes").catch(() => ({}))]);
  for (const [addr, add] of Object.entries(pending)) {
    if (validators.includes(addr.toLowerCase()) === add) await besu.rpc("qbft_discardValidatorVote", [addr]).catch(() => {});
  }
}

async function getValidators() {
  return (await besu.rpc("qbft_getValidatorsByBlockNumber", ["latest"])).map((v) => v.toLowerCase());
}

// ───────────── État du réseau, vu de cette machine ─────────────
async function status() {
  const me = self();
  const [block, peersNow, validators, pending, syncing] = await Promise.all([
    besu.rpc("eth_blockNumber").then(Number), besu.rpc("admin_peers"), getValidators(),
    besu.rpc("qbft_getPendingVotes").catch(() => ({})), besu.rpc("eth_syncing").catch(() => false),
  ]);
  const connected = new Set(peersNow.map((p) => String(p.id).replace(/^0x/, "")));
  const isValidator = (n) => validators.includes(n.validator.toLowerCase());

  // Votes connus pour chaque candidat : le nôtre + ceux relayés par les applications des autres validateurs.
  const ballots = [{ id: me.id, validator: me.validator, votes: pending },
    ...Object.entries(votesSeen).map(([id, v]) => ({ id, ...v }))].filter((b) => validators.includes(b.validator.toLowerCase()));
  const votesFor = (addr) => ballots.filter((b) =>
    Object.entries(b.votes || {}).some(([a, add]) => a.toLowerCase() === addr.toLowerCase() && add !== validators.includes(addr.toLowerCase()))).length;

  const nodes = [{ ...me, self: true, connected: true }, ...others().map((p) => ({ ...p, self: false, connected: connected.has(p.id) }))]
    .map((n) => ({ ...n, isValidator: isValidator(n), votes: votesFor(n.validator),
      votedByMe: Object.entries(pending).some(([a, add]) => a.toLowerCase() === n.validator.toLowerCase() && add !== isValidator(n)) }));
  const known = new Set(nodes.map((n) => n.id));
  const unknownPeers = [...connected].filter((id) => !known.has(id)).length;

  const online = nodes.filter((n) => n.isValidator && n.connected).length;
  const quorum = Math.ceil((2 * validators.length) / 3);
  return {
    block, syncing: Boolean(syncing), peers: connected.size, unknownPeers, nodes,
    validators: validators.length, quorum, validatorsOnline: online,
    votesNeeded: Math.floor(validators.length / 2) + 1, // majorité stricte des validateurs
    iAmValidator: validators.includes(me.validator.toLowerCase()),
  };
}

// ───────────── Diagnostic de connexion ─────────────
function tcp(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 2500 });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.once("connect", () => done(true)).once("timeout", () => done(false)).once("error", () => done(false));
  });
}

// Pour chaque autre nœud : son application répond-elle ? son port P2P est-il ouvert ? peut-il,
// lui, ouvrir une connexion vers nous ? Chaque échec est traduit en cause probable.
async function diagnose() {
  const me = self();
  const st = await status();
  const results = await Promise.all(st.nodes.filter((n) => !n.self).map(async (n) => {
    const [app, p2pOut] = await Promise.all([
      call(appUrl(n), "probe", { p2pPort: me.p2pPort }).catch((e) => ({ error: e.message })),
      tcp(n.host, n.p2pPort),
    ]);
    const r = { name: n.name, host: n.host, connected: n.connected, appReachable: !app.error, p2pOut, p2pIn: app.error ? null : app.reachable,
      skewS: app.error ? null : Math.round((app.time - Date.now()) / 1000), seesMeAs: app.yourIp };
    r.advice = advise(r, n, me);
    return r;
  }));
  const general = [];
  if (!results.length) general.push("Aucun autre nœud connu : partagez l'adresse et le code d'invitation de cette machine.");
  if (st.validators > 1 && st.validatorsOnline < st.quorum) {
    general.push(`Seuls ${st.validatorsOnline} validateurs sur ${st.validators} sont en ligne, il en faut ${st.quorum} : la production de blocs est en pause jusqu'à leur retour.`);
  }
  return { me: { host: me.host, p2pPort: me.p2pPort }, results, general, log: besu.logTail(15) };
}

function advise(r, n, me) {
  if (r.connected) {
    return r.p2pIn === false
      ? "Connecté. Cette machine n'accepte pas les connexions entrantes (pare-feu), mais la connexion sortante suffit."
      : "Connecté.";
  }
  if (!r.appReachable && !r.p2pOut) {
    return `Aucune réponse de ${n.host}. Machine éteinte, adresse IP changée, ou réseau qui isole les appareils ` +
      "(Wi-Fi d'école ou public : utilisez un partage de connexion ou Tailscale).";
  }
  if (r.seesMeAs && r.seesMeAs !== me.host && r.seesMeAs !== "127.0.0.1") {
    return `Ce nœud nous voit à l'adresse ${r.seesMeAs}, mais nous annonçons ${me.host} : corrigez l'adresse annoncée ci-dessus.`;
  }
  if (!r.p2pOut && r.p2pIn === false) {
    return `Le port ${n.p2pPort} est bloqué dans les deux sens : autorisez Java dans le pare-feu d'au moins une des deux machines ` +
      "(Windows : « Autoriser l'accès » pour les réseaux privés ET publics ; macOS : Réglages > Réseau > Coupe-feu).";
  }
  if (Math.abs(r.skewS) > 10) return `Les horloges diffèrent de ${r.skewS} s : réglez la date et l'heure en automatique sur les deux machines.`;
  return "Joignable mais pas encore pair : la connexion est demandée toutes les 10 s. Si cela dure, les deux machines ne sont pas sur le même réseau blockchain (quitter puis rejoindre).";
}

// Notes de transport : publiques mais conservées par leur auteur. `accept` vérifie le hash on-chain.
const missed = new Map(); // hash -> date du dernier échec, pour ne pas redemander à chaque rafraîchissement
async function fetchNote(hash, accept) {
  if (Date.now() - (missed.get(hash) || 0) < 30_000) return undefined;
  for (const p of others()) {
    const r = await call(appUrl(p), "note", { hash }).catch(() => null);
    if (r?.text !== undefined && accept(r.text)) return r.text;
  }
  missed.set(hash, Date.now());
  return undefined;
}

module.exports = {
  fetchNote,
  clean, isLocal, enode, self, selfForAnnounce, others, all, upsert, forget, farewell, welcome, announce, reannounce, maintain, status, diagnose, tcp,
  pendingVotes: () => besu.rpc("qbft_getPendingVotes").catch(() => ({})),
};
