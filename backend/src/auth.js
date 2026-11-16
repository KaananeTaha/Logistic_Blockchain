// Comptes utilisateurs de cette machine. Un compte est une paire de clés ; la clé privée est chiffrée
// avec le mot de passe de son propriétaire (format « keystore » d'Ethereum) et n'est déchiffrée en
// mémoire que le temps de la session. Le rôle, lui, n'est pas stocké ici : il est lu sur la blockchain.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { paths } = require("./config");

const sessions = new Map(); // jeton -> { wallet, name }
const SCRYPT = { scrypt: { N: 16384 } }; // dérivation de clé rapide : suffisant pour un prototype

function list() {
  if (!fs.existsSync(paths.keystore)) return [];
  return fs.readdirSync(paths.keystore).filter((f) => f.endsWith(".json")).map((f) => {
    const { name, address, publicKey } = JSON.parse(fs.readFileSync(path.join(paths.keystore, f), "utf8"));
    return { name, address, publicKey };
  });
}

async function create(name, password) {
  if (!name?.trim() || String(password || "").length < 4) throw new Error("Nom et mot de passe (4 caractères minimum) requis.");
  const wallet = ethers.Wallet.createRandom();
  const keystore = await ethers.encryptKeystoreJson({ address: wallet.address, privateKey: wallet.privateKey }, password, SCRYPT);
  fs.mkdirSync(paths.keystore, { recursive: true });
  fs.writeFileSync(path.join(paths.keystore, `${wallet.address.toLowerCase()}.json`),
    JSON.stringify({ name: name.trim(), address: wallet.address, publicKey: wallet.signingKey.publicKey, keystore }, null, 2), { mode: 0o600 });
  return new ethers.Wallet(wallet.privateKey);
}

// `who` : adresse ou nom d'un compte de cette machine.
async function unlock(who, password) {
  const key = String(who || "").toLowerCase();
  const account = list().find((a) => a.address.toLowerCase() === key || a.name.toLowerCase() === key);
  if (!account) throw new Error("Compte inconnu sur cette machine.");
  const file = JSON.parse(fs.readFileSync(path.join(paths.keystore, `${account.address.toLowerCase()}.json`), "utf8"));
  try {
    const { privateKey } = await ethers.decryptKeystoreJson(file.keystore, String(password));
    return { wallet: new ethers.Wallet(privateKey), name: account.name };
  } catch {
    throw new Error("Mot de passe incorrect.");
  }
}

function open(res, wallet, name) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { wallet, name });
  res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  return token;
}

function tokenOf(req) {
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  return bearer ? bearer[1] : /(?:^|;\s*)session=([0-9a-f]+)/.exec(req.headers.cookie || "")?.[1];
}

const current = (req) => sessions.get(tokenOf(req));

function close(req, res) {
  sessions.delete(tokenOf(req));
  res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0");
}

// Toute écriture sur la blockchain passe par ici : c'est le compte connecté qui signe, jamais un autre.
function requireUser(req, res, next) {
  req.user = current(req);
  if (!req.user) return res.status(401).json({ error: "Connectez-vous pour signer cette action." });
  next();
}

module.exports = { list, create, unlock, open, close, current, requireUser };
