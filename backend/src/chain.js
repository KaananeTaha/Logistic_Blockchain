// Pont entre l'API et la blockchain : lecture du contrat et envoi de transactions signées
// avec le compte du profil concerné.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { ROLES, walletFor } = require("../../config/demo-accounts");

const DEPLOYMENT = path.join(__dirname, "..", "..", "deployment.json");
if (!fs.existsSync(DEPLOYMENT)) {
  console.error("deployment.json introuvable : lancez d'abord `npm run deploy`.");
  process.exit(1);
}
const { address, abi } = JSON.parse(fs.readFileSync(DEPLOYMENT, "utf8"));

// cacheTimeout -1 : sinon ethers met le nonce en cache 250 ms et deux transactions rapprochées
// du même compte réutilisent le même nonce.
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
const contract = new ethers.Contract(address, abi, provider);

const STATUS = ["Créé", "Pris en charge", "En douane", "En stockage", "En transit", "Livré", "Litige"];

// Prototype : le serveur détient la clé de chaque profil de démo. En production, chaque acteur
// signerait depuis son propre wallet (MetaMask) et le serveur ne verrait jamais les clés.
const signers = Object.fromEntries(
  Object.keys(ROLES).map((r) => [r, contract.connect(walletFor(r).connect(provider))]));

// Une file par compte : les transactions d'un même compte partent l'une après l'autre,
// ce qui évite les conflits de nonce quand l'interface et le simulateur IoT écrivent en même temps.
const queues = {};
function send(role, method, ...args) {
  const run = async () => {
    const tx = await signers[role][method](...args);
    const receipt = await tx.wait();
    const events = receipt.logs
      .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
      .filter(Boolean);
    return { txHash: receipt.hash, block: receipt.blockNumber, events };
  };
  const p = (queues[role] || Promise.resolve()).then(run, run);
  queues[role] = p.catch(() => {});
  return p;
}

// Message lisible à partir d'un revert Solidity (ex: "Role non autorise").
function reason(e) {
  return e.reason || e.info?.error?.message || e.shortMessage || e.message;
}

// Convertit les résultats ethers (bigint, Result) en JSON simple.
function plain(v) {
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

async function readLot(id) {
  const lot = plain((await contract.getLot(id)).toObject());
  return { ...lot, statusLabel: STATUS[lot.status] };
}

module.exports = { provider, contract, address, STATUS, send, reason, plain, readLot };
