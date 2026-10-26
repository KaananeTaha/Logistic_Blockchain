// Page publique de traçabilité (Fct5) : c'est elle qu'ouvre le QR Code collé sur le colis.
const id = new URLSearchParams(location.search).get("id");

const INTEGRITY = {
  ok: ['ok', "Données off-chain intactes : leur hash correspond à celui inscrit sur la blockchain."],
  tampered: ['bad', "Données off-chain MODIFIÉES : leur hash ne correspond plus à celui de la blockchain."],
  missing: ['warn', "Données off-chain introuvables sur ce serveur."],
};

async function load() {
  if (!id) { document.getElementById("content").innerHTML = "<p>Aucun identifiant de lot.</p>"; return; }
  let t;
  try { t = await api(`/lots/${id}`); }
  catch (e) { document.getElementById("content").innerHTML = `<div class="result bad">${esc(e.message)}</div>`; return; }

  const { lot, history, readings, anomalies, privateData, integrity } = t;
  document.getElementById("title").textContent = `${lot.nature} × ${lot.quantity}`;
  const [cls, msg] = INTEGRITY[integrity];

  document.getElementById("content").innerHTML = `
    <div class="card">
      <div class="qr">
        <img src="/api/lots/${id}/qrcode" alt="QR Code du lot">
        <div>
          <div>${statusBadge(lot)} ${flags(lot)}</div>
          <p class="mono">${id}</p>
          <p class="muted">Plage tolérée ${lot.minTemp / 10}–${lot.maxTemp / 10} °C · échéance ${fmtTime(lot.deadline)}<br>
          Fournisseur ${esc(lot.supplierName || "")} <span class="mono">${short(lot.supplier)}</span> → Destinataire ${esc(lot.recipientName || "")} <span class="mono">${short(lot.recipient)}</span></p>
          <span class="badge ${cls}">${msg}</span>
        </div>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Parcours (inscrit sur la blockchain)</h2>
        <ol class="timeline">${history.map((h) => `
          <li class="${h.status === 5 ? "ok" : h.status === 6 ? "bad" : ""}">
            <b>${esc(h.statusLabel)}</b> <span class="muted">${fmtTime(h.timestamp)}</span><br>
            ${h.note ? esc(h.note) + "<br>" : ""}<span class="muted">signé par ${esc(h.actorName || "")}</span> <span class="muted mono">${short(h.actor)}</span>
          </li>`).join("")}
          ${anomalies.map((a) => `<li class="bad"><span class="badge bad">⚠ ${esc(a.reason)}</span> <span class="muted">${fmtTime(a.timestamp)}</span></li>`).join("")}
        </ol>
      </div>
      <div class="card">
        <h2>Données privées (off-chain)</h2>
        <p class="muted">Dans ce prototype elles sont visibles par tous ; en production, seuls les acteurs autorisés y auraient accès.</p>
        <pre class="mono">${esc(JSON.stringify(privateData, null, 2))}</pre>
      </div>
    </div>
    <div class="card chart">
      <h2>Température pendant le transport (${readings.length} mesures)</h2>
      ${chart(readings, lot.minTemp / 10, lot.maxTemp / 10)}
    </div>`;
}

// Courbe SVG simple : bande verte = plage tolérée, points rouges = mesures hors plage.
function chart(readings, min, max) {
  if (!readings.length) return '<p class="muted">Aucune mesure reçue.</p>';
  const W = 600, H = 220, P = 32;
  const temps = readings.map((r) => r.temperature);
  const lo = Math.min(min, ...temps) - 1, hi = Math.max(max, ...temps) + 1;
  const x = (i) => P + (readings.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (readings.length - 1));
  const y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
  const pts = readings.map((r, i) => `${x(i)},${y(r.temperature)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Température mesurée">
    <rect class="band" x="${P}" y="${y(max)}" width="${W - 2 * P}" height="${y(min) - y(max)}"/>
    <line class="axis" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}"/>
    <text x="4" y="${y(max) + 4}">${max}°</text><text x="4" y="${y(min) + 4}">${min}°</text>
    <polyline class="line" points="${pts}"/>
    ${readings.map((r, i) => `<circle class="pt ${r.temperature < min || r.temperature > max ? "out" : ""}" cx="${x(i)}" cy="${y(r.temperature)}" r="4"><title>${r.temperature} °C · ${fmtTime(r.timestamp)}</title></circle>`).join("")}
  </svg>`;
}

load();
setInterval(load, 3000); // suit le lot en direct pendant la simulation IoT
