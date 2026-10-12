// Stockage OFF-CHAIN : données privées des lots et textes libres (notes, motifs de litige).
// La blockchain n'en garde que le hash ; ce fichier peut donc être modifié, mais toute
// modification devient détectable (voir integrity() dans routes/lots.js).
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const FILE = path.join(__dirname, "..", "data", "offchain.json");

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { lots: {}, notes: {} }; }
}

function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
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
  FILE,
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
