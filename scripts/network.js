// Réseau privé Hyperledger Besu à 4 validateurs (consensus QBFT). Fonctionne sous macOS, Linux et Windows.
//
//   node scripts/network.js generate [--force]          clés des 4 validateurs + genesis (une seule fois, par une personne)
//   node scripts/network.js local                       les 4 nœuds sur cette machine (répétition, persistance)
//   node scripts/network.js start <N> --ip <mon IP> [--bootnode <IP du nœud 1>] [--docker]
//                                                       un nœud par machine (démonstration sur 4 laptops)
//   node scripts/network.js status [--rpc url1,url2…]   état de chaque nœud : bloc, pairs, validateurs
//   node scripts/network.js reset --yes                 efface les données des nœuds (la chaîne repart de zéro)
//
// Les données de chaque nœud sont écrites sur disque (network/data/nodeN) : la blockchain survit aux redémarrages.
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..", "network");
const GEN = path.join(ROOT, "generated");
const DATA = path.join(ROOT, "data");
const NODES = 4;
const CHAIN_ID = 1337;
const P2P_PORT = 30303;
const RPC_PORT = 8545;

// ───────────── Genesis ─────────────
// extraData QBFT = RLP([32 octets de « vanity », liste des validateurs, vote vide, round 0, sceaux vides]).
function qbftExtraData(validators) {
  return ethers.encodeRlp([ethers.ZeroHash, validators, [], "0x", []]);
}

function genesis(validators) {
  return {
    config: {
      chainId: CHAIN_ID,
      berlinBlock: 0,
      contractSizeLimit: 2147483647,
      qbft: { blockperiodseconds: 2, epochlength: 30000, requesttimeoutseconds: 4 },
    },
    nonce: "0x0",
    timestamp: "0x58ee40ba",
    gasLimit: "0x1fffffffffffff",
    difficulty: "0x1",
    mixHash: "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    coinbase: "0x0000000000000000000000000000000000000000",
    alloc: {},
    extraData: qbftExtraData(validators),
  };
}

function generate(force) {
  if (fs.existsSync(path.join(GEN, "genesis.json")) && !force) {
    fail("network/generated existe déjà. Régénérer créerait une AUTRE blockchain, incompatible avec les nœuds existants.\n" +
      "Si c'est voulu : node scripts/network.js generate --force (puis reset --yes sur chaque machine).");
  }
  const wallets = Array.from({ length: NODES }, () => ethers.Wallet.createRandom());
  const nodes = wallets.map((w, i) => ({
    node: i + 1,
    validator: w.address,
    enodeId: w.signingKey.publicKey.slice(4), // clé publique sans le préfixe 04
  }));
  for (const [i, w] of wallets.entries()) {
    fs.mkdirSync(path.join(GEN, `node${i + 1}`), { recursive: true });
    fs.writeFileSync(path.join(GEN, `node${i + 1}`, "key"), w.privateKey);
  }
  const validators = nodes.map((n) => n.validator.toLowerCase()).sort();
  fs.writeFileSync(path.join(GEN, "genesis.json"), JSON.stringify(genesis(validators), null, 2));
  fs.writeFileSync(path.join(GEN, "nodes.json"), JSON.stringify(nodes, null, 2));

  console.log("Réseau généré dans network/generated/ :");
  for (const n of nodes) console.log(`  nœud ${n.node}  validateur ${n.validator}`);
  console.log("\nÀ partager : genesis.json et nodes.json avec tout le monde, nodeN/key uniquement avec la personne du nœud N.");
  console.log("Les fichiers key sont des clés PRIVÉES : ne pas les commiter (déjà dans .gitignore).");
}

// ───────────── Lancement des nœuds ─────────────
function besuArgs({ n, ip, p2pPort, rpcPort, bootnode, paths }) {
  const args = [
    `--data-path=${paths.data}`,
    `--genesis-file=${paths.genesis}`,
    `--node-private-key-file=${paths.key}`,
    `--p2p-host=${ip}`, `--p2p-port=${p2pPort}`,
    "--rpc-http-enabled", "--rpc-http-host=0.0.0.0", `--rpc-http-port=${rpcPort}`,
    "--rpc-http-api=ETH,NET,WEB3,QBFT", "--rpc-http-cors-origins=all", "--host-allowlist=*",
    // Gaz gratuit : prix 0, donc une transaction ne coûte rien même depuis un compte vide.
    "--min-gas-price=0", "--profile=ENTERPRISE",
  ];
  if (n !== 1) args.push(`--bootnodes=${bootnode}`);
  return args;
}

function enode(nodes, ip, port = P2P_PORT) {
  return `enode://${nodes[0].enodeId}@${ip}:${port}`;
}

function besuBinary() {
  const bin = process.env.BESU_BIN || (process.platform === "win32" ? "besu.bat" : "besu");
  const ok = spawnSync(bin, ["--version"], { shell: process.platform === "win32" }).status === 0;
  if (!ok) {
    fail("Besu introuvable. Installez Java 25+ et Besu (voir network/README.md), ou indiquez son chemin : BESU_BIN=/chemin/vers/bin/besu\n" +
      "Sur macOS/Linux, vous pouvez aussi utiliser Docker : ajoutez --docker (mode « start » uniquement).");
  }
  return bin;
}

function run(label, cmd, args, logFile) {
  const child = spawn(cmd, args, { shell: process.platform === "win32" });
  const log = logFile && fs.createWriteStream(logFile, { flags: "a" });
  const onData = (buf) => {
    log?.write(buf);
    for (const line of buf.toString().split("\n")) {
      // On ne recopie à l'écran que l'essentiel ; le journal complet est dans le fichier.
      if (!logFile || /ERROR|WARN|Produced #|Imported #|Enode URL/.test(line)) {
        if (line.trim()) console.log(`[${label}] ${line.trim()}`);
      }
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => console.log(`[${label}] arrêté (code ${code})`));
  return child;
}

function loadNodes() {
  const f = path.join(GEN, "nodes.json");
  if (!fs.existsSync(f)) fail("network/generated/nodes.json introuvable : lancez d'abord `npm run network:generate`.");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// Les 4 nœuds sur cette machine, ports décalés : RPC 8545-8548, P2P 30303-30306.
function local() {
  const nodes = loadNodes();
  const bin = besuBinary();
  fs.mkdirSync(DATA, { recursive: true });
  const children = nodes.map((nd, i) => {
    const n = i + 1;
    const args = besuArgs({
      n, ip: "127.0.0.1", p2pPort: P2P_PORT + i, rpcPort: RPC_PORT + i, bootnode: enode(nodes, "127.0.0.1"),
      paths: { data: path.join(DATA, `node${n}`), genesis: path.join(GEN, "genesis.json"), key: path.join(GEN, `node${n}`, "key") },
    });
    console.log(`nœud ${n} : RPC http://127.0.0.1:${RPC_PORT + i}  journal network/data/node${n}.log`);
    return run(`nœud ${n}`, bin, args, path.join(DATA, `node${n}.log`));
  });
  console.log("\nVérifiez avec `npm run network:status` (dans un autre terminal). Ctrl+C arrête les 4 nœuds.");
  process.on("SIGINT", () => { children.forEach((c) => c.kill("SIGINT")); setTimeout(() => process.exit(0), 3000); });
}

// Un nœud sur cette machine (une machine par membre du groupe).
function start(n, ip, bootIp, docker) {
  if (!(n >= 1 && n <= NODES) || !ip) fail("Usage : node scripts/network.js start <1-4> --ip <IP de cette machine> [--bootnode <IP du nœud 1>] [--docker]");
  if (n !== 1 && !bootIp) fail("Les nœuds 2 à 4 ont besoin de l'IP du nœud 1 : --bootnode <IP>");
  const nodes = loadNodes();
  const key = path.join(GEN, `node${n}`, "key");
  if (!fs.existsSync(key)) fail(`Clé du nœud ${n} introuvable (${path.relative(process.cwd(), key)}) : demandez-la à la personne qui a généré le réseau.`);
  fs.mkdirSync(path.join(DATA, `node${n}`), { recursive: true });

  const common = { n, ip, p2pPort: P2P_PORT, rpcPort: RPC_PORT, bootnode: enode(nodes, bootIp) };
  if (docker) {
    const args = besuArgs({ ...common, paths: { data: "/data", genesis: "/genesis.json", key: "/key" } });
    run(`nœud ${n}`, "docker", [
      "run", "--rm", "--name", `besu-node${n}`,
      "-p", `${RPC_PORT}:${RPC_PORT}`, "-p", `${P2P_PORT}:${P2P_PORT}`, "-p", `${P2P_PORT}:${P2P_PORT}/udp`,
      "-v", `${path.join(GEN, "genesis.json")}:/genesis.json:ro`, "-v", `${key}:/key:ro`, "-v", `${path.join(DATA, `node${n}`)}:/data`,
      "hyperledger/besu:latest", ...args,
    ]);
  } else {
    const args = besuArgs({ ...common, paths: { data: path.join(DATA, `node${n}`), genesis: path.join(GEN, "genesis.json"), key } });
    run(`nœud ${n}`, besuBinary(), args);
  }
}

// ───────────── État du réseau ─────────────
async function rpc(url, method, params = []) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(3000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function status(urls) {
  if (!urls.length) urls = Array.from({ length: NODES }, (_, i) => `http://127.0.0.1:${RPC_PORT + i}`);
  console.log("Nœud                          Bloc   Pairs  Validateurs  Dernier bloc proposé par");
  for (const url of urls) {
    try {
      const [block, peers, validators, latest] = await Promise.all([
        rpc(url, "eth_blockNumber"), rpc(url, "net_peerCount"),
        rpc(url, "qbft_getValidatorsByBlockNumber", ["latest"]).catch(() => []),
        rpc(url, "eth_getBlockByNumber", ["latest", false]),
      ]);
      console.log(`${url.padEnd(30)} ${String(Number(block)).padEnd(6)} ${String(Number(peers)).padEnd(6)} ${String(validators.length).padEnd(12)} ${latest.miner}`);
    } catch (e) {
      console.log(`${url.padEnd(30)} injoignable (${e.cause?.code || e.message})`);
    }
  }
  console.log("\nAttendu : même numéro de bloc partout (à 1 près), 3 pairs par nœud, 4 validateurs.");
}

function reset(yes) {
  if (!yes) fail("Ceci efface toute la blockchain de cette machine. Confirmez avec : node scripts/network.js reset --yes");
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log("network/data supprimé. Pensez à redéployer le contrat (npm run deploy:besu).");
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// ───────────── Ligne de commande ─────────────
const [cmd, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };

if (require.main === module) {
  if (cmd === "generate") generate(rest.includes("--force"));
  else if (cmd === "local") local();
  else if (cmd === "start") start(Number(rest[0]), opt("ip"), opt("bootnode"), rest.includes("--docker"));
  else if (cmd === "status") status((opt("rpc") || "").split(",").filter(Boolean));
  else if (cmd === "reset") reset(rest.includes("--yes"));
  else fail("Commandes : generate | local | start | status | reset (détails en tête de scripts/network.js)");
}

module.exports = { qbftExtraData, genesis };
