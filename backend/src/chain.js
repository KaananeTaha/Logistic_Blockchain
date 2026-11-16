// Pont entre l'API et la blockchain : lecture du contrat, signature des transactions avec le compte
// connecté, et explication pas à pas de ce qui se passe (« coulisses »).
const { ethers } = require("ethers");
const { abi, bytecode } = require("../contract.json");
const besu = require("./besu");
const config = require("./config");
const store = require("./store");

const STATUS = ["Créé", "Pris en charge", "En douane", "En stockage", "En transit", "Livré", "Litige"];
const ROLE_KEYS = [null, "supplier", "carrier", "manager", "recipient"]; // index = enum Role du contrat
const ROLE_IDS = { supplier: 1, carrier: 2, manager: 3, recipient: 4 };
const ROLE_LABELS = {
  manager: "Gestionnaire (MOA)", supplier: "Fournisseur / Producteur",
  carrier: "Transporteur / Logisticien", recipient: "Destinataire / Client final",
};
const GAS = { gasPrice: 0 }; // réseau privé à gaz gratuit

// Renseignés par connect(), une fois le nœud local démarré.
const chain = { provider: null, contract: null, address: null, ready: false };

function connect() {
  // cacheTimeout -1 : sinon ethers met le nonce en cache 250 ms et deux transactions rapprochées
  // du même compte réutilisent le même nonce.
  chain.provider = new ethers.JsonRpcProvider(besu.rpcUrl(), besu.CHAIN_ID, { cacheTimeout: -1, staticNetwork: true, pollingInterval: 500 });
  chain.ready = false;
  chain.address = chain.contract = null;
}

// Le contrat n'est visible qu'une fois ce nœud synchronisé avec le réseau : à rappeler tant que
// `ready` est faux (nœud qui vient de rejoindre, ou qui n'a encore aucun pair).
async function attach() {
  const address = config.get().contract;
  if (chain.ready || !address) return chain.ready;
  if ((await chain.provider.getCode(address)) === "0x") return false;
  chain.address = address;
  chain.contract = new ethers.Contract(address, abi, chain.provider);
  store.init(besu.CHAIN_ID, address);
  return (chain.ready = true);
}

// Création du réseau : le fondateur déploie le contrat et en devient le Gestionnaire.
async function deploy(wallet, managerName) {
  const factory = new ethers.ContractFactory(abi, bytecode, wallet.connect(chain.provider));
  const c = await factory.deploy(managerName, GAS);
  await c.waitForDeployment();
  return c.getAddress();
}

// ───────────── Annuaire (lu sur la blockchain) ─────────────
// Noms, rôles et demandes d'accès sont dans le contrat : chaque machine voit le même annuaire,
// sans serveur central.
let cache = { at: 0, list: [] };
async function members() {
  if (Date.now() - cache.at > 1500) {
    const list = (await chain.contract.getMembers()).map((m) => ({
      address: m.account, name: m.name, role: ROLE_KEYS[Number(m.role)], requested: ROLE_KEYS[Number(m.requested)],
    }));
    cache = { at: Date.now(), list };
  }
  return cache.list;
}

async function describe(addr) {
  const key = String(addr).toLowerCase();
  const m = (await members()).find((x) => x.address.toLowerCase() === key);
  if (m) return m;
  // Les nœuds signent aussi (vérification automatique des délais) : on les reconnaît par leur adresse.
  const me = besu.identity();
  const node = [{ validator: me.validator, name: config.get().nodeName }, ...(config.get().peers || [])]
    .find((n) => n.validator.toLowerCase() === key);
  return node ? { address: addr, name: `Nœud ${node.name}`, node: true } : undefined;
}

async function who(addr) {
  const a = await describe(addr);
  if (!a) return addr;
  return a.role ? `${a.name} (${ROLE_LABELS[a.role]})` : a.name;
}

// ───────────── Réseau et consensus ─────────────
async function networkInfo() {
  const [block, peers, client, validators] = await Promise.all([
    chain.provider.getBlockNumber(),
    chain.provider.send("net_peerCount", []).then(Number),
    chain.provider.send("web3_clientVersion", []),
    chain.provider.send("qbft_getValidatorsByBlockNumber", ["latest"]),
  ]);
  return {
    name: config.get().networkName, chainId: besu.CHAIN_ID, client, block, peers, contract: chain.address,
    consensus: { name: "QBFT", quorum: Math.ceil((2 * validators.length) / 3), validators },
  };
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
  requestAccess: ["rôle demandé valide", "nom renseigné (64 caractères au plus)"],
  checkDeadline: ["le lot n'est pas clôturé", "date limite comparée à l'heure du bloc"],
};

const step = (title, detail, kind = "") => ({ title, detail, kind });

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
  const b = await chain.provider.getBlock(receipt.blockNumber);
  const { quorum, validators } = (await networkInfo()).consensus;
  const consensus = `Proposé par le validateur ${await who(b.miner)}, puis approuvé par au moins ${quorum} des ${validators.length} validateurs (QBFT). Le bloc est final immédiatement.`;
  return step(`Inscrite dans le bloc #${b.number}`,
    `Hash du bloc ${b.hash}\nHash du bloc précédent ${b.parentHash} (c'est ce lien qui forme la chaîne : modifier un ancien bloc casserait tous les suivants)\n${consensus}`);
}

// Envoie une transaction signée par `wallet` et renvoie le détail de chaque étape.
// `before` : étapes déjà faites (hash...).
function send(wallet, method, args, { before = [] } = {}) {
  const { contract, address } = chain;
  const steps = [...before];
  const fragment = contract.interface.getFunction(method);
  const shown = fragment.inputs.map((p, i) => `${p.name} = ${fmtValue(args[i])}`).join(", ");
  steps.push(step("Construction de la transaction", `${method}(${shown})\nDestination : le contrat ${address}`));

  return enqueue(wallet.address, async () => {
    let tx;
    try {
      tx = await contract.connect(wallet.connect(chain.provider))[method](...args, GAS);
    } catch (e) {
      steps.push(step("Refusée par le Smart Contract",
        `Le nœud a simulé la transaction et le contrat l'a rejetée : « ${reason(e)} ».\nRien n'a été inscrit sur la blockchain.`, "bad"));
      throw Object.assign(new Error(reason(e)), { steps });
    }
    steps.push(step("Diffusée au réseau", `Hash de la transaction : ${tx.hash}\nLe nœud de cette machine la transmet à ses pairs ; le prochain validateur désigné l'inclut dans son bloc.`));
    const receipt = await tx.wait();
    cache.at = 0; // l'annuaire a pu changer
    const sig = tx.signature;
    const pub = recoverPublicKey(tx);
    steps.push(step(`Signée par ${await who(wallet.address)}`,
      `Signature ECDSA avec sa clé privée (qui ne quitte jamais cette machine).\nr = ${sig.r}\ns = ${sig.s}\n` +
      `Les nœuds retrouvent la clé publique à partir de la signature : ${pub}\n` +
      (pub && ethers.computeAddress(pub) === wallet.address ? `✓ L'adresse dérivée de cette clé publique est bien ${wallet.address} : l'auteur est prouvé.` : "")));
    steps.push(step("Exécutée par le Smart Contract sur chaque nœud",
      `Contrôles passés : ${(CHECKS[method] || []).join(" ; ")}.\nGaz consommé : ${receipt.gasUsed} (gratuit sur ce réseau).`, "ok"));
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
  const lot = plain((await chain.contract.getLot(id)).toObject());
  return { ...lot, statusLabel: STATUS[lot.status] };
}

// ───────────── Explorateur de blocs ─────────────
async function explore(count = 10) {
  const { provider, contract } = chain;
  const latest = await provider.getBlockNumber();
  const blocks = [];
  for (let n = latest; n >= Math.max(0, latest - count + 1); n--) {
    const b = await provider.getBlock(n, true);
    blocks.push({
      number: b.number, hash: b.hash, parentHash: b.parentHash, timestamp: b.timestamp, miner: b.miner, proposer: await who(b.miner),
      txs: await Promise.all(b.prefetchedTransactions.map(async (tx) => {
        let call = null;
        try {
          const p = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
          if (p) call = `${p.name}(${p.fragment.inputs.map((x, i) => `${x.name}: ${fmtValue(p.args[i])}`).join(", ")})`;
        } catch {}
        if (!call) call = tx.to ? "Transaction vers un autre contrat" : "Déploiement du contrat";
        return { hash: tx.hash, from: tx.from, signer: await who(tx.from), publicKey: recoverPublicKey(tx), call };
      })),
    });
  }
  return blocks;
}

module.exports = Object.assign(chain, {
  STATUS, ROLE_IDS, ROLE_LABELS,
  connect, attach, deploy, members, describe, who, networkInfo, send, step, reason, plain, readLot, explore,
});
