// Scénario complet, sans interface : un lot de vaccins traverse toute la chaîne,
// subit une rupture de la chaîne du froid, puis le destinataire ouvre un litige.
// Prérequis : blockchain + contrat déployé + `npm start` en cours.
const API = process.env.API_URL || "http://localhost:3000";

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${path} : ${json.error}`);
  return json;
}

const step = (msg) => console.log(`\n▶ ${msg}`);

async function main() {
  step("Fournisseur : création du lot (vaccins, 2–8 °C, livraison sous 30 min)");
  const { lotId, txHash } = await call("POST", "/api/lots", {
    nature: "Vaccins antigrippaux", quantity: 500, minTemp: 2, maxTemp: 8, deadlineMinutes: 30,
    privateData: { numeroLot: "VAX-2026-0412", prixUnitaireMAD: 85, client: "Pharmacie Centrale Marrakech" },
  });
  console.log(`  lotId ${lotId}\n  tx    ${txHash}`);

  const steps = [
    [1, "Pris en charge à l'entrepôt de Casablanca"],
    [2, "Contrôle douanier, port de Casablanca"],
    [4, "Départ vers Marrakech via l'A7"],
  ];
  for (const [status, note] of steps) {
    step(`Transporteur : ${note}`);
    const r = await call("POST", `/api/lots/${lotId}/status`, { status, note });
    console.log(`  bloc ${r.block}  événements : ${r.events.join(", ")}`);
  }

  step("Capteur IoT : 4 mesures, dont une panne du groupe froid");
  for (const [temperature, lat, lon] of [[4.8, 33.2, -7.65], [5.3, 32.7, -7.8], [12.4, 32.24, -7.95], [6.1, 31.8, -7.98]]) {
    const r = await call("POST", `/api/iot/${lotId}`, { temperature, lat, lon });
    console.log(`  ${String(temperature).padStart(4)} °C  bloc ${r.block}${r.anomalies.length ? `  ⚠ ${r.anomalies}` : ""}`);
  }

  step("Destinataire : refuse la livraison et ouvre un litige");
  await call("POST", `/api/lots/${lotId}/dispute`, { reason: "Rupture de la chaîne du froid constatée (12,4 °C)" });

  const t = await call("GET", `/api/lots/${lotId}`);
  step("Historique lu sur la blockchain");
  for (const h of t.history) {
    console.log(`  ${new Date(h.timestamp * 1000).toLocaleTimeString()}  ${h.statusLabel.padEnd(15)} ${h.note || ""}`);
  }
  console.log(`  Alertes : ${t.anomalies.map((a) => a.reason).join(", ") || "aucune"}`);
  console.log(`  Intégrité des données off-chain : ${t.integrity}`);
  console.log(`\nPage de traçabilité : ${API}/lot.html?id=${lotId}`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
