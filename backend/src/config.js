// Tout ce que l'application écrit sur cette machine tient dans un seul dossier (app-data/ par défaut) :
// configuration du nœud, clé du nœud, base de la blockchain, comptes chiffrés, données hors chaîne.
// APP_HOME et PORT permettent de lancer plusieurs instances sur une même machine (répétition).
const fs = require("fs");
const path = require("path");

const HOME = path.resolve(process.env.APP_HOME || path.join(__dirname, "..", "..", "app-data"));
const PORT = Number(process.env.PORT) || 3000;

const paths = {
  home: HOME,
  config: path.join(HOME, "config.json"),
  genesis: path.join(HOME, "genesis.json"),
  nodekey: path.join(HOME, "nodekey"),
  besuData: path.join(HOME, "besu-data"),
  besuToml: path.join(HOME, "besu.toml"),
  besuLog: path.join(HOME, "besu.log"),
  keystore: path.join(HOME, "keystore"),
  offchain: path.join(HOME, "offchain"),
  tools: path.join(HOME, "tools"),
};

// config.json : { networkName, nodeName, host, p2pPort, rpcPort, joinCode, contract, peers: [] }
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(paths.config, "utf8")); } catch {}

function save(patch) {
  cfg = { ...(cfg || {}), ...patch };
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(paths.config, JSON.stringify(cfg, null, 2));
  return cfg;
}

// Quitte le réseau : efface le nœud et sa copie de la chaîne. Les comptes chiffrés sont conservés.
function reset() {
  cfg = null;
  for (const p of [paths.config, paths.genesis, paths.nodekey, paths.besuData, paths.besuToml, paths.besuLog, paths.offchain]) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

module.exports = { HOME, PORT, paths, get: () => cfg, configured: () => Boolean(cfg), save, reset };
