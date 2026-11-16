// Cycle de vie de cette machine dans le réseau : créer un réseau, en rejoindre un, redémarrer, quitter.
const fs = require("fs");
const crypto = require("crypto");
const config = require("./config");
const besu = require("./besu");
const peers = require("./peers");
const chain = require("./chain");
const auth = require("./auth");
const { sweep } = require("./keeper");

// phase : "setup" (machine vierge) → "starting" (opération en cours) → "ready" (nœud démarré)
const state = { phase: "setup", message: "", error: null, warning: null };
const say = (m) => { state.message = m; console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────── Tâches de fond ─────────────
let timer = null, busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await peers.maintain();
    if (await unstick()) return;
    if (await chain.attach()) await sweep();
  } catch (e) {
    console.error("[entretien]", e.shortMessage || e.message);
  } finally {
    busy = false;
  }
}

// Après une perte de quorum, les validateurs restés allumés attendent de plus en plus longtemps entre
// deux tentatives : le délai QBFT double à chaque tour (4 s, 8 s, 16 s… plus de 2 min au tour 5, des
// heures après une nuit). Au retour des autres, la chaîne resterait figée tout ce temps. Redémarrer
// le nœud remet son tour à zéro : on le fait quand le quorum est revenu, qu'aucun bloc n'arrive et
// que ce nœud est bloqué dans un tour élevé. Les nœuds qui viennent de revenir ne sont pas concernés.
const STUCK_ROUND = 5;
let lastBlock = -1, lastProgress = Date.now(), startedAt = Date.now();
async function unstick() {
  const st = await peers.status();
  const now = Date.now();
  if (st.block !== lastBlock) {
    lastBlock = st.block;
    lastProgress = now;
    return false;
  }
  const stuck = st.iAmValidator && st.validatorsOnline >= st.quorum && besu.round() >= STUCK_ROUND
    && now - lastProgress > 30_000 && now - startedAt > 180_000;
  if (!stuck) return false;
  console.log(`[entretien] quorum revenu mais nœud bloqué au tour ${besu.round()} : redémarrage pour relancer le consensus`);
  restart("Relance du consensus après une coupure…"); // sans attendre : restart() suspend cette boucle
  return true;
}

async function restart(message) {
  loops(false);
  state.phase = "starting";
  say(message);
  try {
    await besu.stopAndWait();
    await run();
  } catch (e) {
    console.error(e);
    state.phase = "error";
    state.error = e.shortMessage || e.message;
  }
}

function loops(on) {
  clearInterval(timer);
  timer = on ? setInterval(tick, 10_000) : null;
  if (on) tick();
}

// ───────────── Démarrage d'une machine déjà configurée ─────────────
async function run() {
  state.phase = "starting";
  say("Recherche des autres nœuds…");
  // Les adresses IP changent d'un jour à l'autre (DHCP, autre Wi-Fi) : on reprend celle que les
  // autres nœuds voient, ou à défaut une adresse actuelle de cette machine.
  const seenAs = await peers.reannounce();
  const mine = besu.localIps().map((i) => i.ip);
  const host = config.get().host;
  if (seenAs && seenAs !== host) config.save({ host: seenAs });
  else if (!seenAs && host !== "127.0.0.1" && !mine.includes(host) && mine.length) config.save({ host: mine[0] });

  await besu.start(peers.others().map(peers.enode), say);
  chain.connect();
  await chain.attach().catch(() => false);
  state.phase = "ready";
  state.message = "";
  startedAt = lastProgress = Date.now();
  loops(true);
}

// `taken` : ports déjà attribués à d'autres nœuds de cette même machine (répétition sur un seul poste),
// même s'ils ne sont pas en train d'écouter.
async function ports(taken = []) {
  const p2pPort = await besu.pickPort(Number(process.env.P2P_PORT) || 30303, "0.0.0.0", taken);
  const rpcPort = await besu.pickPort(Number(process.env.RPC_PORT) || 8545, "127.0.0.1", [p2pPort, ...taken]);
  return { p2pPort, rpcPort };
}

// Une opération de configuration : en cas d'échec, la machine redevient vierge et l'erreur est affichée.
async function setup(job) {
  if (state.phase !== "setup") throw new Error("Cette machine fait déjà partie d'un réseau.");
  state.phase = "starting";
  state.error = state.warning = null;
  try {
    await job();
  } catch (e) {
    console.error(e);
    loops(false);
    if (config.configured()) await peers.farewell(); // déjà annoncé aux autres : on se retire
    await besu.stopAndWait();
    config.reset();
    state.phase = "setup";
    state.error = e.shortMessage || e.message;
  }
}

// ───────────── Créer un réseau ─────────────
// Cette machine devient le premier validateur ; son utilisateur déploie le contrat et devient Gestionnaire.
function create({ networkName, nodeName, host, userName, password }) {
  return setup(async () => {
    if (!networkName?.trim() || !nodeName?.trim() || !host) throw new Error("Nom du réseau, nom de la machine et adresse requis.");
    // Le compte existe déjà (réseau précédent, ou tentative interrompue) : on le réutilise si le mot de passe est le bon.
    const existing = auth.list().some((a) => a.name.toLowerCase() === String(userName).trim().toLowerCase());
    const wallet = existing ? (await auth.unlock(String(userName).trim(), password)).wallet : await auth.create(userName, password);
    const me = besu.identity();
    fs.writeFileSync(config.paths.genesis, JSON.stringify(besu.genesis([me.validator]), null, 2));
    // Code d'invitation : à donner (avec l'adresse de cette machine) à ceux qui rejoignent le réseau.
    const joinCode = crypto.randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})/, "$1-");
    config.save({ networkName: networkName.trim(), nodeName: nodeName.trim(), host, ...(await ports()), joinCode, contract: null, peers: [] });

    await besu.start([], say);
    chain.connect();
    say("Attente du premier bloc…");
    for (let i = 0; i < 60 && (await chain.provider.getBlockNumber()) < 1; i++) await sleep(1000);
    say("Déploiement du Smart Contract…");
    config.save({ contract: await chain.deploy(wallet, String(userName).trim()) });
    await chain.attach();
    state.phase = "ready";
    state.message = "";
    loops(true);
  });
}

// ───────────── Rejoindre un réseau ─────────────
// `address` : adresse de l'application d'une machine déjà membre (ex. 192.168.1.12:3000).
function join({ address, code, nodeName }) {
  return setup(async () => {
    if (!address?.trim() || !code?.trim() || !nodeName?.trim()) throw new Error("Adresse, code d'invitation et nom de la machine requis.");
    let base = address.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) base = `http://${base}`;
    if (!new URL(base).port) base += ":3000";
    code = code.trim().toUpperCase();

    const me = besu.identity();
    say(`Contact de ${base}…`);
    let r, p;
    try {
      // Premier échange sans s'inscrire : il valide le code et dit sous quelle adresse on est vu.
      const hello = await peers.announce(base, code);
      const sameMachine = [hello.contact, ...hello.peers].filter((n) => n.host === hello.yourIp || n.host === "127.0.0.1");
      p = await ports(sameMachine.map((n) => n.p2pPort));
      r = await peers.announce(base, code, { id: me.id, validator: me.validator, name: nodeName.trim(), p2pPort: p.p2pPort, appPort: config.PORT });
    } catch (e) {
      if (e.name !== "TimeoutError" && !e.cause) throw e; // réponse de l'application : mauvais code, etc.
      throw new Error(`Impossible de joindre ${base}. Vérifiez l'adresse, que l'application y est lancée et que les deux machines ` +
        "sont sur le même réseau. Un Wi-Fi d'école ou public isole souvent les appareils : utilisez un partage de connexion ou Tailscale. " +
        "Sous Windows, autorisez Node.js dans le pare-feu de la machine contactée.");
    }
    fs.mkdirSync(config.paths.home, { recursive: true });
    fs.writeFileSync(config.paths.genesis, JSON.stringify(r.network.genesis, null, 2));
    config.save({ networkName: r.network.name, nodeName: nodeName.trim(), host: r.yourIp, ...p, joinCode: code, contract: r.network.contract, peers: [] });
    peers.upsert(r.contact);
    r.peers.forEach(peers.upsert);
    if (Math.abs(r.skewMs) > 10_000) {
      state.warning = `L'horloge de cette machine diffère de ${Math.round(r.skewMs / 1000)} s de celle du réseau : passez la date et l'heure en réglage automatique.`;
    }
    await run();
  });
}

// ───────────── Quitter le réseau ─────────────
async function leave() {
  loops(false);
  await peers.farewell();
  await besu.stopAndWait();
  config.reset();
  chain.ready = false;
  Object.assign(state, { phase: "setup", message: "", error: null, warning: null });
}

// Changer l'adresse annoncée aux autres nœuds (mauvaise interface choisie, VPN…) : redémarre le nœud.
function setHost(host) {
  config.save({ host });
  return restart("Redémarrage du nœud avec la nouvelle adresse…");
}

async function boot() {
  if (!config.configured()) return;
  try {
    await run();
  } catch (e) {
    console.error(e);
    state.phase = "error";
    state.error = e.shortMessage || e.message;
  }
}

module.exports = { state, boot, create, join, leave, setHost };
