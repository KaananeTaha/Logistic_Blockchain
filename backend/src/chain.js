// Pont entre l'API et la blockchain : lecture du contrat, signature des transactions avec le
// compte choisi, et explication pas à pas de ce qui se passe (« coulisses »).
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { ROLES, walletFor } = require("../../config/demo-accounts");
const store = require("./store");

const DEPLOYMENT = path.join(__dirname, "..", "..", "deployment.json");
if (!fs.existsSync(DEPLOYMENT)) {
  console.error("deployment.json introuvable : lancez d'abord `npm run deploy` (ou `npm run deploy:besu`).");
  process.exit(1);
}
const { address, abi } = JSON.parse(fs.readFileSync(DEPLOYMENT, "utf8"));

// cacheTimeout -1 : sinon ethers met le nonce en cache 250 ms et deux transactions rapprochées
// du même compte réutilisent le même nonce.
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
const contract = new ethers.Contract(address, abi, provider);

const STATUS = ["Créé", "Pris en charge", "En douane", "En stockage", "En transit", "Livré", "Litige"];
const ROLE_IDS = Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.roleId]));
const ROLE_LABELS = Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.label]));

// Renseigné par init() au démarrage.
const net = { chainId: null, freeGas: false };

async function init() {
  net.chainId = Number((await provider.getNetwork()).chainId);
  net.freeGas = net.chainId === 1337; // réseau Besu du projet (genesis à gaz gratuit)
  store.init(net.chainId, address);
}

// ───────────── Comptes ─────────────
// Comptes de démo (dérivés de la mnémonique) + comptes créés depuis l'application.
function demoAccounts() {
  return Object.keys(ROLES).map((role) => {
    const w = walletFor(role);
    return { name: `${ROLE_LABELS[role]} (démo)`, role, address: w.address, publicKey: w.signingKey.publicKey, demo: true };
  });
}

function listAccounts() {
  return [...demoAccounts(), ...store.listAccounts().map(({ privateKey, ...pub }) => pub)];
}

function describe(addr) {
  return listAccounts().find((a) => a.address.toLowerCase() === String(addr).toLowerCase());
}

const wallets = {};
function walletOf(addr) {
  const key = String(addr).toLowerCase();
  if (!wallets[key]) {
    const demo = Object.keys(ROLES).find((r) => walletFor(r).address.toLowerCase() === key);
    const created = store.listAccounts().find((a) => a.address.toLowerCase() === key);
    if (!demo && !created) throw new Error(`Compte inconnu : ${addr}`);
    wallets[key] = (demo ? walletFor(demo) : new ethers.Wallet(created.privateKey)).connect(provider);
  }
  return wallets[key];
}

const defaultAccount = (role) => walletFor(role).address;

// ───────────── Réseau et consensus ─────────────
async function networkInfo() {
  const [block, peers, client] = await Promise.all([
    provider.getBlockNumber(),
    provider.send("net_peerCount", []).then(Number).catch(() => 0),
    provider.send("web3_clientVersion", []).catch(() => "inconnu"),
  ]);
  let validators = null;
  try { validators = await provider.send("qbft_getValidatorsByBlockNumber", ["latest"]); } catch {}
  const consensus = validators
    ? { name: "QBFT", quorum: Math.ceil((2 * validators.length) / 3), validators }
    : { name: "Aucun (nœud unique Hardhat)", quorum: 1, validators: [] };
  return { chainId: net.chainId, rpc: RPC_URL, client, block, peers, contract: address, freeGas: net.freeGas, consensus };
}

// ───────────── Transactions ─────────────
// Une file par compte : les transactions d'un même compte partent l'une après l'autre,
// ce qui évite les conflits de nonce quand l'interface et le simulateur IoT écrivent en même temps.
const queues = {};
function enqueue(addr, run) {
  const key = addr.toLowerCase();
  const p = (queues[key] || Promise.resolve()).then(run, run);
  queues[key] = p.catch(() => {});
  return p;
}

// Contrôles effectués par le contrat pour chaque fonction (affichés dans les coulisses).
const CHECKS = {
  createLot: ["l'appelant a le rôle Fournisseur", "le destinataire a le rôle Destinataire", "seuils cohérents (min ≤ max)", "date limite dans le futur"],
  updateStatus: ["l'appelant a le rôle Transporteur", "le lot existe et n'est pas clôturé", "statut autorisé (un transporteur ne peut pas déclarer « Livré »)", "règle des délais"],
  recordSensorData: ["l'appelant a le rôle Transporteur", "le lot n'est pas clôturé", "température comparée à la plage tolérée", "règle des délais"],
  confirmDelivery: ["l'appelant a le rôle Destinataire", "c'est bien le destinataire de ce lot", "le lot n'est pas clôturé", "règle des délais"],
  raiseDispute: ["l'appelant a le rôle Destinataire", "c'est bien le destinataire de ce lot", "le lot n'est pas clôturé"],
  setRules: ["l'appelant a le rôle Gestionnaire", "seuils cohérents (min ≤ max)"],
  grantRole: ["l'appelant a le rôle Gestionnaire"],
  checkDeadline: ["le lot n'est pas clôturé", "date limite comparée à l'heure du bloc"],
};

const step = (title, detail, kind = "") => ({ title, detail, kind });

function who(addr) {
  const a = describe(addr);
  if (!a) return addr;
  return a.demo ? a.name : `${a.name} (${ROLE_LABELS[a.role]})`;
}

function fmtValue(v) {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return `[${v.map(fmtValue).join(", ")}]`;
  return String(v);
}

// La clé publique n'est pas transmise : on la retrouve mathématiquement à partir de la signature.
function recoverPublicKey(tx) {
  try {
    const t = { type: tx.type, to: tx.to, nonce: tx.nonce, gasLimit: tx.gasLimit, data: tx.data, value: tx.value, chainId: tx.chainId, signature: tx.signature };
    if (tx.type === 2) Object.assign(t, { maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas, accessList: tx.accessList });
    else Object.assign(t, { gasPrice: tx.gasPrice }, tx.type === 1 ? { accessList: tx.accessList } : {});
    return ethers.Transaction.from(t).fromPublicKey;
  } catch {
    return null;
  }
}

async function blockStep(receipt) {
  const b = await provider.getBlock(receipt.blockNumber);
  const info = await networkInfo();
  const consensus = info.consensus.validators.length
    ? `Proposé par le validateur ${b.miner}, puis approuvé par au moins ${info.consensus.quorum} des ${info.consensus.validators.length} validateurs (QBFT). Le bloc est final immédiatement.`
    : "Un seul nœud (Hardhat) : il produit le bloc immédiatement, sans vote. C'est le rôle que joueront les 4 validateurs Besu.";
  return step(`Inscrite dans le bloc #${b.number}`,
    `Hash du bloc ${b.hash}\nHash du bloc précédent ${b.parentHash} (c'est ce lien qui forme la chaîne : modifier un ancien bloc casserait tous les suivants)\n${consensus}`);
}

// Envoie une transaction et renvoie le détail de chaque étape. `before` : étapes déjà faites (hash...).
function send(from, method, args, { before = [] } = {}) {
  const wallet = walletOf(from);
  const steps = [...before];
  const fragment = contract.interface.getFunction(method);
  const shown = fragment.inputs.map((p, i) => `${p.name} = ${fmtValue(args[i])}`).join(", ");
  steps.push(step("Construction de la transaction", `${method}(${shown})\nDestination : le contrat ${address}`));

  return enqueue(wallet.address, async () => {
    let tx;
    try {
      tx = await contract.connect(wallet)[method](...args, net.freeGas ? { gasPrice: 0 } : {});
    } catch (e) {
      steps.push(step("Refusée par le Smart Contract",
        `Le nœud a simulé la transaction et le contrat l'a rejetée : « ${reason(e)} ».\nRien n'a été inscrit sur la blockchain.`, "bad"));
      throw Object.assign(new Error(reason(e)), { steps });
    }
    const receipt = await tx.wait();
    const sig = tx.signature;
    const pub = recoverPublicKey(tx);
    const account = describe(wallet.address);
    steps.push(step(`Signée par ${who(wallet.address)}`,
      `Signature ECDSA avec sa clé privée (qui ne quitte jamais le signataire).\nr = ${sig.r}\ns = ${sig.s}\n` +
      `Les nœuds retrouvent la clé publique à partir de la signature : ${pub}\n` +
      (account && pub === account.publicKey ? "✓ Elle correspond à la clé publique du compte : l'auteur est prouvé." : "")));
    steps.push(step("Exécutée par le Smart Contract sur chaque nœud",
      `Contrôles passés : ${(CHECKS[method] || []).join(" ; ")}.\nGaz consommé : ${receipt.gasUsed}${net.freeGas ? " (gratuit sur ce réseau)" : ""}.`, "ok"));
    steps.push(await blockStep(receipt));

    const events = receipt.logs
      .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
      .filter(Boolean);
    if (events.length) {
      steps.push(step("Événements émis par le contrat",
        events.map((e) => `${e.name}(${e.fragment.inputs.map((p, i) => `${p.name}: ${fmtValue(e.args[i])}`).join(", ")})`).join("\n"),
        events.some((e) => e.name === "AnomalyRaised") ? "bad" : ""));
    }
    return { txHash: receipt.hash, block: receipt.blockNumber, events, steps };
  });
}

// Transfert d'ETH (financement d'un nouveau compte sur un réseau où le gaz est payant).
function fund(to, amount = "10") {
  const manager = walletOf(defaultAccount("manager"));
  return enqueue(manager.address, async () => (await manager.sendTransaction({ to, value: ethers.parseEther(amount) })).wait());
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

// ───────────── Explorateur de blocs ─────────────
async function explore(count = 10) {
  const latest = await provider.getBlockNumber();
  const blocks = [];
  for (let n = latest; n >= Math.max(0, latest - count + 1); n--) {
    const b = await provider.getBlock(n, true);
    blocks.push({
      number: b.number, hash: b.hash, parentHash: b.parentHash, timestamp: b.timestamp, miner: b.miner,
      txs: b.prefetchedTransactions.map((tx) => {
        let call = null;
        try {
          const p = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
          if (p) call = `${p.name}(${p.fragment.inputs.map((x, i) => `${x.name}: ${fmtValue(p.args[i])}`).join(", ")})`;
        } catch {}
        if (!call) call = tx.to ? `Transfert de ${ethers.formatEther(tx.value)} ETH` : "Déploiement du contrat";
        return { hash: tx.hash, from: tx.from, signer: who(tx.from), publicKey: recoverPublicKey(tx), call };
      }),
    });
  }
  return blocks;
}

module.exports = {
  provider, contract, address, net, STATUS, ROLE_IDS, ROLE_LABELS,
  init, listAccounts, describe, defaultAccount, networkInfo, send, fund, step, reason, plain, readLot, explore,
};
