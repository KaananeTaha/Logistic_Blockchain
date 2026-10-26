// Stockage OFF-CHAIN : comptes créés, données privées des lots et textes libres (notes, motifs).
// La blockchain n'en garde que le hash ; toute modification de ce fichier devient détectable.
//
// Un fichier par blockchain (chainId + adresse du contrat) : si la chaîne est réinitialisée ou
// si l'on change de réseau, on repart d'un fichier vierge au lieu de mélanger les données.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const DIR = path.join(__dirname, "..", "data");
let FILE;

function init(chainId, contractAddress) {
  FILE = path.join(DIR, `${chainId}-${contractAddress.toLowerCase()}.json`);
}

function load() {
  try { return { accounts: [], lots: {}, notes: {}, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; }
  catch { return { accounts: [], lots: {}, notes: {} }; }
}

function save(db) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

// JSON à clés triées : le même objet donne toujours le même hash.
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

const hashOf = (v) => ethers.id(canonical(v));

module.exports = {
  init,
  file: () => path.relative(path.join(__dirname, "..", ".."), FILE),
  hashOf,
  savePrivate(lotId, data) {
    const db = load();
    db.lots[lotId] = data;
    save(db);
  },
  getPrivate: (lotId) => load().lots[lotId],
  // Une note est indexée par son hash, qui est celui inscrit on-chain.
  saveNote(text) {
    const h = ethers.id(text);
    const db = load();
    db.notes[h] = text;
    save(db);
    return h;
  },
  getNote: (h) => load().notes[h],
  // Prototype : la clé privée des comptes créés est conservée ici pour que le serveur puisse signer.
  // En production, elle ne quitterait jamais le wallet de son propriétaire.
  listAccounts: () => load().accounts,
  addAccount(account) {
    const db = load();
    db.accounts.push(account);
    save(db);
  },
};
