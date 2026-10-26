// Scénario complet, sans interface, qui suit le parcours de bout en bout :
// création des comptes → création du lot → transport → capteurs (rupture du froid) → litige.
// Prérequis : blockchain + contrat déployé + `npm start` en cours.
// Option --details : affiche le détail complet de chaque étape en coulisses.
const API = process.env.API_URL || "http://localhost:3000";
const DETAILS = process.argv.includes("--details");

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw Object.assign(new Error(`${path} : ${json.error}`), { steps: json.steps });
  return json;
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
  section("Étape 1 : création des comptes (paire de clés + rôle attribué par le Gestionnaire)");
  const accounts = {};
  for (const [role, name] of [["supplier", "Pharma Casablanca"], ["carrier", "Trans-Atlas Logistique"], ["recipient", "Pharmacie Centrale Marrakech"]]) {
    const r = await call("POST", "/api/accounts", { name, role });
    accounts[role] = r.address;
    console.log(`\n ${name}\n   adresse      ${r.address}\n   clé publique ${r.publicKey.slice(0, 26)}…`);
    coulisses(r.steps);
  }

  section("Étape 2 : le Fournisseur crée le lot (vaccins, 2–8 °C, livraison sous 30 min)");
  const lot = await call("POST", "/api/lots", {
    account: accounts.supplier, recipient: accounts.recipient,
    nature: "Vaccins antigrippaux", quantity: 500, minTemp: 2, maxTemp: 8, deadlineMinutes: 30,
    privateData: { numeroLot: "VAX-2026-0412", prixUnitaireMAD: 85 },
  });
  console.log(`   lotId ${lot.lotId} (contenu du QR Code)`);
  coulisses(lot.steps);

  section("Étape 3 : refus attendu, le Fournisseur tente de jouer le Transporteur");
  try {
    await call("POST", `/api/lots/${lot.lotId}/status`, { account: accounts.supplier, status: 1 });
  } catch (e) {
    console.log(`   ${e.message}`);
    coulisses(e.steps);
  }

  section("Étape 4 : le Transporteur enregistre les étapes du trajet");
  for (const [status, note] of [[1, "Pris en charge à l'entrepôt de Casablanca"], [2, "Contrôle douanier, port de Casablanca"], [4, "Départ vers Marrakech via l'A7"]]) {
    const r = await call("POST", `/api/lots/${lot.lotId}/status`, { account: accounts.carrier, status, note });
    console.log(`   ${note} → bloc #${r.block}`);
  }

  section("Étape 5 : le capteur IoT envoie ses mesures, dont une panne du groupe froid");
  for (const [temperature, lat, lon] of [[4.8, 33.2, -7.65], [5.3, 32.7, -7.8], [12.4, 32.24, -7.95], [6.1, 31.8, -7.98]]) {
    const r = await call("POST", `/api/iot/${lot.lotId}`, { account: accounts.carrier, temperature, lat, lon });
    console.log(`   ${String(temperature).padStart(4)} °C → bloc #${r.block}${r.anomalies.length ? `  ⚠ ${r.anomalies}` : ""}`);
    if (r.anomalies.length) coulisses(r.steps);
  }

  section("Étape 6 : le Destinataire refuse la livraison et ouvre un litige");
  const d = await call("POST", `/api/lots/${lot.lotId}/dispute`, { account: accounts.recipient, reason: "Rupture de la chaîne du froid constatée (12,4 °C)" });
  coulisses(d.steps);

  section("Étape 7 : historique relu sur la blockchain");
  const t = await call("GET", `/api/lots/${lot.lotId}`);
  for (const h of t.history) {
    console.log(`   ${new Date(h.timestamp * 1000).toLocaleTimeString()}  ${h.statusLabel.padEnd(15)} ${(h.actorName || "").padEnd(30)} ${h.note || ""}`);
  }
  console.log(`   Alertes : ${t.anomalies.map((a) => a.reason).join(", ") || "aucune"}`);
  console.log(`   Intégrité des données hors chaîne : ${t.integrity}`);
  console.log(`\nPage de traçabilité : ${API}/lot.html?id=${lot.lotId}`);
  if (!DETAILS) console.log("Relancez avec `npm run demo -- --details` pour voir le détail de chaque étape.");
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
