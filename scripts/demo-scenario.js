// Scénario complet, sans interface, qui suit le parcours de bout en bout :
// inscription des acteurs → validation par le Gestionnaire → lot → transport → capteurs → litige.
// Prérequis : l'application lancée (`npm start`) et un réseau créé.
//
//   npm run demo -- --manager "<nom du compte Gestionnaire>" --password <son mot de passe> [--details]
//                   [--apis http://ip2:3000,http://ip3:3000,http://ip4:3000]
//
// --apis : applications où s'inscrivent le Fournisseur, le Transporteur et le Destinataire. Avec trois
// machines différentes, le scénario prouve que chaque étape est répliquée d'un nœud à l'autre.
// --details : affiche le détail complet de chaque étape en coulisses.
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const API = process.env.API_URL || "http://localhost:3000";
const DETAILS = args.includes("--details");
const APIS = (opt("apis") || "").split(",").filter(Boolean);
const PASSWORD = "demo1234"; // mot de passe des trois comptes créés par ce scénario

if (!opt("manager") || !opt("password")) {
  console.error('Usage : npm run demo -- --manager "<compte Gestionnaire>" --password <mot de passe> [--details] [--apis url,url,url]');
  process.exit(1);
}

// Un acteur = une application (celle de sa machine) + sa session.
function actor(api) {
  const me = { api, token: null };
  me.call = async (method, path, body) => {
    const r = await fetch(api + path, {
      method, body: body && JSON.stringify(body),
      headers: { "content-type": "application/json", ...(me.token ? { authorization: `Bearer ${me.token}` } : {}) },
    });
    const json = await r.json();
    if (!r.ok) throw Object.assign(new Error(`${path} : ${json.error}`), { steps: json.steps });
    return json;
  };
  me.login = async (account, password) => { me.token = (await me.call("POST", "/api/auth/login", { account, password })).token; return me; };
  return me;
}

const section = (msg) => console.log(`\n━━ ${msg}`);

// Affiche les étapes « en coulisses » renvoyées par l'API.
function coulisses(steps = []) {
  for (const s of steps) {
    const mark = s.kind === "bad" ? "✖" : s.kind === "ok" ? "✔" : "·";
    console.log(`   ${mark} ${s.title}`);
    if (DETAILS) console.log(s.detail.split("\n").map((l) => `       ${l}`).join("\n"));
  }
}

async function main() {
  const manager = await actor(API).login(opt("manager"), opt("password"));
  const stamp = new Date().toLocaleTimeString("fr-FR"); // rend les noms uniques d'une exécution à l'autre

  section("Étape 1 : chaque acteur crée son compte (paire de clés) sur sa machine et demande un rôle");
  const who = {};
  const cast = [["supplier", "Pharma Casablanca"], ["carrier", "Trans-Atlas Logistique"], ["recipient", "Pharmacie Centrale Marrakech"]];
  for (const [i, [role, label]] of cast.entries()) {
    const a = actor(APIS[i] || API);
    const name = `${label} ${stamp}`;
    const r = await a.call("POST", "/api/auth/register", { name, role, password: PASSWORD });
    await a.login(r.address, PASSWORD);
    who[role] = Object.assign(a, { address: r.address });
    console.log(`\n ${name}  (${a.api})\n   adresse      ${r.address}\n   clé publique ${r.publicKey.slice(0, 26)}…`);
    coulisses(r.steps);
  }
  const { supplier, carrier, recipient } = who;

  section("Étape 1 bis : refus attendu, le Fournisseur n'a encore aucun droit");
  const lotBody = {
    recipient: recipient.address, nature: "Vaccins antigrippaux", quantity: 500, minTemp: 2, maxTemp: 8, deadlineMinutes: 30,
    privateData: { numeroLot: "VAX-2026-0412", prixUnitaireMAD: 85 },
  };
  try { await supplier.call("POST", "/api/lots", lotBody); } catch (e) { console.log(`   ${e.message}`); }

  section("Étape 1 ter : le Gestionnaire lit les demandes sur la blockchain et les valide");
  const pending = (await manager.call("GET", "/api/members")).filter((m) => m.requested);
  for (const m of pending.filter((m) => Object.values(who).some((a) => a.address === m.address))) {
    const r = await manager.call("POST", "/api/roles", { address: m.address, role: { supplier: 1, carrier: 2, recipient: 4 }[m.requested] });
    console.log(`   ${m.name} → ${m.requested} (bloc #${r.block})`);
  }

  section("Étape 2 : le Fournisseur crée le lot (vaccins, 2–8 °C, livraison sous 30 min)");
  const lot = await supplier.call("POST", "/api/lots", lotBody);
  console.log(`   lotId ${lot.lotId} (contenu du QR Code)`);
  coulisses(lot.steps);

  section("Étape 3 : refus attendu, le Fournisseur tente de jouer le Transporteur");
  try {
    await supplier.call("POST", `/api/lots/${lot.lotId}/status`, { status: 1 });
  } catch (e) {
    console.log(`   ${e.message}`);
    coulisses(e.steps);
  }

  section("Étape 4 : le Transporteur enregistre les étapes du trajet");
  for (const [status, note] of [[1, "Pris en charge à l'entrepôt de Casablanca"], [2, "Contrôle douanier, port de Casablanca"], [4, "Départ vers Marrakech via l'A7"]]) {
    const r = await carrier.call("POST", `/api/lots/${lot.lotId}/status`, { status, note });
    console.log(`   ${note} → bloc #${r.block}`);
  }

  section("Étape 5 : le capteur IoT envoie ses mesures, dont une panne du groupe froid");
  for (const [temperature, lat, lon] of [[4.8, 33.2, -7.65], [5.3, 32.7, -7.8], [12.4, 32.24, -7.95], [6.1, 31.8, -7.98]]) {
    const r = await carrier.call("POST", `/api/iot/${lot.lotId}`, { temperature, lat, lon });
    console.log(`   ${String(temperature).padStart(4)} °C → bloc #${r.block}${r.anomalies.length ? `  ⚠ ${r.anomalies}` : ""}`);
    if (r.anomalies.length) coulisses(r.steps);
  }

  section("Étape 6 : le Destinataire refuse la livraison et ouvre un litige");
  const d = await recipient.call("POST", `/api/lots/${lot.lotId}/dispute`, { reason: "Rupture de la chaîne du froid constatée (12,4 °C)" });
  coulisses(d.steps);

  section(`Étape 7 : historique relu sur la blockchain, depuis le nœud du Gestionnaire (${manager.api})`);
  const t = await manager.call("GET", `/api/lots/${lot.lotId}`);
  for (const h of t.history) {
    console.log(`   ${new Date(h.timestamp * 1000).toLocaleTimeString()}  ${h.statusLabel.padEnd(15)} ${(h.actorName || "").padEnd(30)} ${h.note || ""}`);
  }
  console.log(`   Alertes : ${t.anomalies.map((a) => a.reason).join(", ") || "aucune"}`);
  console.log(`   Données privées sur ce nœud : ${t.integrity === "missing" ? "absentes (elles restent chez le Fournisseur ; seul leur hash est répliqué)" : t.integrity}`);
  console.log(`\nPage de traçabilité : ${API}/lot.html?id=${lot.lotId}`);
  if (!DETAILS) console.log("Ajoutez --details pour voir le détail de chaque étape.");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
