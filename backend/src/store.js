// Stockage HORS CHAÎNE de cette machine : données privées des lots et textes libres (notes, motifs).
// La blockchain n'en garde que le hash ; toute modification de ce fichier devient détectable.
// Ces données ne sont pas répliquées : elles restent chez l'organisation qui les a saisies.
//
// Un fichier par contrat : si l'on change de réseau, on repart d'un fichier vierge.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { paths, HOME } = require("./config");

let FILE;

function init(chainId, contractAddress) {
  FILE = path.join(paths.offchain, `${chainId}-${contractAddress.toLowerCase()}.json`);
}

function load() {
  try { return { lots: {}, notes: {}, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; }
  catch { return { lots: {}, notes: {} }; }
}

function save(db) {
  fs.mkdirSync(paths.offchain, { recursive: true });
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
  file: () => path.relative(path.dirname(HOME), FILE),
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
};
