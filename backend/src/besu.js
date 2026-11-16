// Le nœud Hyperledger Besu de cette machine : installation, configuration, démarrage, arrêt, JSON-RPC.
// L'application en est le seul client : le RPC n'écoute que sur 127.0.0.1 (il expose l'API ADMIN).
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { ethers } = require("ethers");
const config = require("./config");

const CHAIN_ID = 1337;
const BESU_VERSION = "26.10.2";
const JAVA_MAJOR = 25;
const WIN = process.platform === "win32";
const { paths } = config;

// ───────────── Genesis ─────────────
// extraData QBFT = RLP([32 octets de « vanity », liste des validateurs, vote vide, round 0, sceaux vides]).
function qbftExtraData(validators) {
  return ethers.encodeRlp([ethers.ZeroHash, validators, [], "0x", []]);
}

// Un réseau naît avec un seul validateur (la machine qui le crée) : il produit des blocs tout de suite.
// Les autres machines rejoignent comme nœuds, puis sont promues validateurs par vote (QBFT).
function genesis(validators) {
  return {
    config: {
      chainId: CHAIN_ID,
      berlinBlock: 0,
      contractSizeLimit: 2147483647,
      qbft: { blockperiodseconds: 2, epochlength: 30000, requesttimeoutseconds: 4 },
    },
    nonce: "0x0",
    timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
    gasLimit: "0x1fffffffffffff",
    difficulty: "0x1",
    mixHash: "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    coinbase: "0x0000000000000000000000000000000000000000",
    alloc: {},
    extraData: qbftExtraData(validators.map((v) => v.toLowerCase()).sort()),
  };
}

// ───────────── Identité du nœud ─────────────
// La clé du nœud est créée ici et ne quitte jamais la machine. Elle donne l'identifiant réseau
// (enode) et l'adresse de validateur.
let me = null;
function identity() {
  if (!fs.existsSync(paths.nodekey)) { // premier lancement, ou machine qui a quitté son réseau
    me = null;
    fs.mkdirSync(paths.home, { recursive: true });
    fs.writeFileSync(paths.nodekey, ethers.Wallet.createRandom().privateKey, { mode: 0o600 });
  }
  if (!me) {
    const wallet = new ethers.Wallet(fs.readFileSync(paths.nodekey, "utf8").trim());
    me = { wallet, id: wallet.signingKey.publicKey.slice(4), validator: wallet.address };
  }
  return me;
}

// ───────────── Localiser ou installer Besu et Java ─────────────
function findDir(root, test, depth = 4) {
  if (!fs.existsSync(root) || depth < 0) return null;
  if (test(root)) return root;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const hit = findDir(path.join(root, e.name), test, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

const javaExe = (home) => path.join(home, "bin", WIN ? "java.exe" : "java");
const besuExe = (home) => path.join(home, "bin", WIN ? "besu.bat" : "besu");
const q = (a) => (WIN && /\s/.test(a) ? `"${a}"` : a); // besu.bat passe par le shell

function javaMajor(exe) {
  const r = spawnSync(exe, ["-version"], { encoding: "utf8" });
  const m = /version "(\d+)/.exec(`${r.stderr}${r.stdout}`);
  return m ? Number(m[1]) : 0;
}

// Java : celui téléchargé par l'application, sinon JAVA_HOME, sinon celui du PATH.
function locateJava() {
  const bundled = findDir(path.join(paths.tools, "jre"), (d) => fs.existsSync(javaExe(d)));
  if (bundled) return { home: bundled };
  if (process.env.JAVA_HOME && javaMajor(javaExe(process.env.JAVA_HOME)) >= JAVA_MAJOR) return { home: process.env.JAVA_HOME };
  if (javaMajor("java") >= JAVA_MAJOR) return { home: null };
  return null;
}

function besuCandidates() {
  const list = [];
  if (process.env.BESU_BIN) list.push(process.env.BESU_BIN);
  for (const root of [paths.tools, path.join(os.homedir(), "tools")]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) if (d.startsWith("besu-") && fs.existsSync(besuExe(path.join(root, d)))) list.push(besuExe(path.join(root, d)));
  }
  list.push(WIN ? "besu.bat" : "besu");
  return list;
}

let located; // { bin, env, version } une fois trouvé
let missingAt = 0; // dernière recherche infructueuse : chaque essai lance une JVM, on ne le refait pas à chaque appel
function locate(force = false) {
  if (located) return located;
  if (!force && Date.now() - missingAt < 60_000) return null;
  missingAt = Date.now();
  const java = locateJava();
  if (!java) return null;
  const env = { ...process.env, ...(java.home ? { JAVA_HOME: java.home } : {}) };
  if (!env.BESU_OPTS) env.BESU_OPTS = "-Xmx1g"; // un portable modeste suffit pour ce réseau
  for (const bin of besuCandidates()) {
    const r = spawnSync(q(bin), ["--version"], { shell: WIN, env, encoding: "utf8" });
    if (r.status === 0) return (located = { bin, env, version: r.stdout.trim().split("\n").pop() });
  }
  return null;
}

async function download(url, file, onProgress) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  let done = 0;
  const body = Readable.fromWeb(res.body);
  body.on("data", (c) => { done += c.length; onProgress(total ? Math.round((100 * done) / total) : 0); });
  await pipeline(body, fs.createWriteStream(file));
}

function extract(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // tar est fourni avec macOS, Linux et Windows 10+ (où il sait aussi lire les .zip).
  const r = spawnSync("tar", ["-xf", archive, "-C", dest], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Extraction impossible : ${r.stderr || r.error?.message}`);
  fs.rmSync(archive, { force: true });
}

// Télécharge dans app-data/tools ce qui manque : un JRE Temurin 25 et/ou Besu. Rien n'est installé
// dans le système ; supprimer le dossier suffit à tout retirer.
async function install(say) {
  fs.mkdirSync(paths.tools, { recursive: true });
  if (!locateJava()) {
    const osName = { darwin: "mac", win32: "windows" }[process.platform] || "linux";
    const arch = { arm64: "aarch64", x64: "x64" }[process.arch] || process.arch;
    const file = path.join(paths.tools, WIN ? "jre.zip" : "jre.tar.gz");
    await download(`https://api.adoptium.net/v3/binary/latest/${JAVA_MAJOR}/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`, file,
      (p) => say(`Téléchargement de Java ${JAVA_MAJOR} (${p} %)`));
    say("Extraction de Java…");
    extract(file, path.join(paths.tools, "jre"));
  }
  if (!locate(true)) {
    const file = path.join(paths.tools, WIN ? "besu.zip" : "besu.tar.gz");
    await download(`https://github.com/besu-eth/besu/releases/download/${BESU_VERSION}/besu-${BESU_VERSION}.${WIN ? "zip" : "tar.gz"}`, file,
      (p) => say(`Téléchargement de Besu ${BESU_VERSION} (${p} %)`));
    say("Extraction de Besu…");
    extract(file, paths.tools);
  }
  if (!locate(true)) throw new Error("Besu ne démarre pas après installation. Installez Java 25+ et Besu à la main, puis indiquez BESU_BIN.");
  return located;
}

// ───────────── Ports ─────────────
function portFree(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

async function pickPort(preferred, host, taken = []) {
  for (let p = preferred; p < preferred + 50; p++) if (!taken.includes(p) && await portFree(p, host)) return p;
  throw new Error(`Aucun port libre à partir de ${preferred}`);
}

// Adresses IPv4 de cette machine (Wi-Fi, Ethernet, VPN…), pour choisir celle que les autres voient.
function localIps() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    list.filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, ip: a.address })));
}

// ───────────── Processus ─────────────
let child = null;
let adoptedPid = null;
let round = 0;
const PIDFILE = path.join(paths.home, "besu.pid");
const tail = []; // dernières lignes du journal, sans codes couleur

function writeToml() {
  const c = config.get();
  const s = JSON.stringify; // chaîne TOML valide, y compris pour les chemins Windows
  fs.writeFileSync(paths.besuToml, [
    `data-path=${s(paths.besuData)}`,
    `genesis-file=${s(paths.genesis)}`,
    `node-private-key-file=${s(paths.nodekey)}`,
    // Adresse annoncée aux autres nœuds. L'écoute, elle, se fait sur toutes les interfaces.
    `p2p-host=${s(c.host)}`,
    `p2p-port=${c.p2pPort}`,
    'nat-method="NONE"',
    // Pas de « bootnodes » : sous Windows, Besu lit chaque valeur comme un chemin de fichier et refuse le
    // « : » de « enode:// » (« Illegal char <:> at index 5 »), même dans ce fichier. Les pairs sont
    // ajoutés après le démarrage par admin_addPeer (voir start() et peers.maintain()).
    "rpc-http-enabled=true",
    'rpc-http-host="127.0.0.1"',
    `rpc-http-port=${c.rpcPort}`,
    'rpc-http-api=["ETH","NET","WEB3","QBFT","ADMIN"]',
    'host-allowlist=["*"]',
    'sync-mode="FULL"',
    // Gaz gratuit : une transaction ne coûte rien, même depuis un compte vide.
    "min-gas-price=0",
    'profile="ENTERPRISE"',
  ].join("\n") + "\n");
}

async function rpc(method, params = [], timeout = 5000) {
  const r = await fetch(`http://127.0.0.1:${config.get().rpcPort}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(timeout),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `peers` : adresses enode des nœuds connus, auxquels on se connecte dès que le nœud répond.
async function start(peers, say = () => {}) {
  const me = identity();
  // Un nœud de cette application tourne déjà (l'application a été fermée brutalement) : on le reprend.
  const running = await rpc("admin_nodeInfo", [], 1500).catch(() => null);
  if (running) {
    if (running.id?.replace(/^0x/, "") !== me.id) {
      throw new Error(`Le port ${config.get().rpcPort} est occupé par un autre nœud Besu. Arrêtez-le, puis relancez l'application.`);
    }
    try { adoptedPid = Number(fs.readFileSync(PIDFILE, "utf8")); } catch {}
    return;
  }
  fs.rmSync(PIDFILE, { force: true }); // reste d'une session précédente : ce processus n'existe plus
  const besu = locate(true) || await install(say);
  writeToml();
  say("Démarrage du nœud Besu…");
  round = 0;
  const log = fs.createWriteStream(paths.besuLog, { flags: "a" });
  child = spawn(q(besu.bin), [q(`--config-file=${paths.besuToml}`)], { shell: WIN, env: besu.env });
  const proc = child;
  fs.writeFileSync(PIDFILE, String(proc.pid));
  let exited = null;
  const onData = (buf) => {
    log.write(buf);
    for (const line of buf.toString().replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
      if (line.trim()) tail.push(line.trim());
      // Tour de consensus en cours pour le prochain bloc (0 en temps normal ; il monte quand le quorum manque).
      const m = /Round: (\d+) \(Local node\)/.exec(line);
      if (m) round = Number(m[1]);
      else if (/Imported|Produced/.test(line)) round = 0;
    }
    tail.splice(0, Math.max(0, tail.length - 300));
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("error", (e) => { exited = e.message; });
  proc.on("exit", (code) => { exited = `code ${code}`; if (child === proc) child = null; });

  for (let i = 0; i < 120; i++) { // la JVM met quelques secondes à démarrer
    if (exited) throw new Error(`Besu s'est arrêté au démarrage (${exited}) :\n${tail.slice(-6).join("\n")}`);
    if (await rpc("net_version", [], 1000).catch(() => null)) {
      await Promise.all(peers.map((e) => rpc("admin_addPeer", [e]).catch(() => {})));
      return;
    }
    await sleep(1000);
  }
  throw new Error("Besu ne répond pas après 2 minutes. Journal : " + paths.besuLog);
}

// Le numéro de processus est gardé sur disque : on peut ainsi arrêter un nœud repris après un
// arrêt brutal de l'application.
function stop() {
  const pid = child?.pid || adoptedPid;
  child = null;
  adoptedPid = null;
  fs.rmSync(PIDFILE, { force: true });
  if (!pid) return;
  // Sous Windows le processus lancé est cmd.exe : il faut arrêter tout l'arbre pour atteindre Java.
  if (WIN) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"]);
  else try { process.kill(pid, "SIGTERM"); } catch {}
}

// Arrêt puis attente que le processus ait vraiment rendu ses ports et fermé sa base.
async function stopAndWait() {
  stop();
  if (!config.get()) return;
  for (let i = 0; i < 30 && await rpc("net_version", [], 800).catch(() => null); i++) await sleep(500);
  await sleep(1500);
}

const rpcUrl = () => `http://127.0.0.1:${config.get().rpcPort}`;

module.exports = {
  CHAIN_ID, qbftExtraData, genesis, identity, locate, install, pickPort, localIps,
  start, stop, stopAndWait, round: () => round, rpc, rpcUrl, logTail: (n = 40) => tail.slice(-n), running: () => Boolean(child),
};
