// Interface multi-profils : chaque onglet correspond à un profil du canevas et signe avec son compte.
let config, lots = [];
let profile = (() => { try { return localStorage.getItem("profile"); } catch { return null; } })() || "supplier";
const $ = (id) => document.getElementById(id);

// ───────────── Navigation entre profils ─────────────
function renderTabs() {
  const order = ["supplier", "carrier", "manager", "recipient"];
  $("tabs").innerHTML = order.map((k) =>
    `<button data-tab="${k}" class="${k === profile ? "active" : ""}">${esc(config.accounts[k].label)}
       <small class="mono">${short(config.accounts[k].address)}</small></button>`).join("");
  $("tabs").querySelectorAll("button").forEach((b) => b.onclick = () => { profile = b.dataset.tab; show(); });
}

function show() {
  try { localStorage.setItem("profile", profile); } catch {}
  document.querySelectorAll("[data-panel]").forEach((p) => p.hidden = p.dataset.panel !== profile);
  renderTabs();
  refresh();
}

// ───────────── Rafraîchissement (toutes les 3 s) ─────────────
async function refresh() {
  try {
    lots = await api("/lots");
    const cfg = await api("/config");
    $("network").textContent = `Chaîne ${cfg.chainId} · bloc #${cfg.block} · contrat ${short(cfg.contract)}`;
  } catch (e) {
    $("network").textContent = e.message;
    return;
  }
  fillSelects();
  if (profile === "supplier") renderLotTable("supplier-lots", lots, false);
  if (profile === "manager") renderManager();
  updateTraceLink();
}

function fillSelects() {
  document.querySelectorAll(".lot-select").forEach((sel) => {
    const keep = sel.value;
    const list = sel.dataset.filter === "open" ? lots.filter((l) => l.status < 5) : lots;
    sel.innerHTML = list.length
      ? list.slice().reverse().map((l) => `<option value="${l.id}">${short(l.id)} · ${esc(l.nature)} · ${esc(l.statusLabel)}</option>`).join("")
      : "<option value=''>Aucun lot ouvert</option>";
    if (list.some((l) => l.id === keep)) sel.value = keep;
  });
}

function renderLotTable(id, list, withRules) {
  $(id).innerHTML = `<tr><th>Lot</th><th>Nature</th><th>Statut</th><th>Contrôles</th>${withRules ? "<th>Plage</th><th>Échéance</th>" : ""}</tr>` +
    (list.slice().reverse().map((l) => `<tr>
      <td><a class="mono" href="lot.html?id=${l.id}" target="_blank">${short(l.id)}</a></td>
      <td>${esc(l.nature)} × ${l.quantity}</td><td>${statusBadge(l)}</td><td>${flags(l)}</td>
      ${withRules ? `<td>${l.minTemp / 10}–${l.maxTemp / 10} °C</td><td>${fmtTime(l.deadline)}</td>` : ""}
    </tr>`).join("") || "<tr><td colspan='6' class='muted'>Aucun lot pour l'instant.</td></tr>");
}

async function renderManager() {
  const count = (f) => lots.filter(f).length;
  const kpi = [
    ["Lots", lots.length],
    ["En cours", count((l) => l.status < 5)],
    ["Livrés", count((l) => l.status === 5)],
    ["Litiges", count((l) => l.status === 6)],
    ["Ruptures du froid", count((l) => l.coldChainBreach)],
    ["En retard", count((l) => l.late)],
  ];
  $("kpis").innerHTML = kpi.map(([k, v]) => `<div class="kpi"><span class="muted">${k}</span><b>${v}</b></div>`).join("");
  renderLotTable("manager-lots", lots, true);

  const alerts = await api("/alerts");
  $("alerts").innerHTML = "<tr><th>Heure</th><th>Lot</th><th>Alerte</th></tr>" +
    (alerts.map((a) => `<tr><td>${fmtTime(a.timestamp)}</td>
      <td><a class="mono" href="lot.html?id=${a.lotId}" target="_blank">${short(a.lotId)}</a></td>
      <td><span class="badge bad">${esc(a.reason)}</span></td></tr>`).join("") || "<tr><td colspan='3' class='muted'>Aucune alerte.</td></tr>");
}

function updateTraceLink() {
  const id = $("recipient-lot").value;
  $("recipient-trace").href = id ? `lot.html?id=${id}` : "#";
}

// ───────────── Actions ─────────────
// Exécute une transaction, affiche le résultat et rafraîchit les données.
async function act(button, resultId, fn) {
  button.disabled = true;
  try {
    const r = await fn();
    const extra = r.anomalies?.length ? ` · ⚠ ${r.anomalies.join(", ")}` : "";
    $(resultId).innerHTML = `<div class="result ok">Transaction validée${r.block ? ` dans le bloc #${r.block}` : ""}${extra}<br><span class="mono">${r.txHash}</span></div>`;
    toast(extra ? `Alerte déclenchée par le Smart Contract${extra}` : "Transaction inscrite sur la blockchain");
    await refresh();
    return r;
  } catch (e) {
    $(resultId).innerHTML = `<div class="result bad">Refusé : ${esc(e.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

$("create-form").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  const button = ev.target.querySelector("button");
  button.disabled = true;
  try {
    const { lotId, txHash } = await api("/lots", {
      nature: f.nature, quantity: +f.quantity, minTemp: +f.minTemp, maxTemp: +f.maxTemp, deadlineMinutes: +f.deadlineMinutes,
      privateData: { numeroLot: f.numeroLot, prixUnitaireMAD: +f.prix },
    });
    $("create-result").innerHTML = `<div class="result ok">Lot enregistré.
      <div class="qr"><img src="/api/lots/${lotId}/qrcode" alt="QR Code du lot">
      <div><b>Identifiant</b><div class="mono">${lotId}</div>
      <p><a href="lot.html?id=${lotId}" target="_blank">Ouvrir la page de traçabilité →</a></p>
      <span class="muted">tx ${short(txHash)}</span></div></div></div>`;
    toast("Lot inscrit sur la blockchain");
    await refresh();
  } catch (e) {
    $("create-result").innerHTML = `<div class="result bad">Refusé : ${esc(e.message)}</div>`;
  } finally {
    button.disabled = false;
  }
};

$("btn-status").onclick = (e) => act(e.target, "status-result", () =>
  api(`/lots/${$("carrier-lot").value}/status`, { status: +$("carrier-status").value, note: $("carrier-note").value }));

$("btn-iot").onclick = (e) => act(e.target, "iot-result", () => {
  const [lat, lon] = $("iot-pos").value.split(",").map(Number);
  return api(`/iot/${$("carrier-lot").value}`, { temperature: +$("iot-temp").value, lat, lon });
});

$("btn-rules").onclick = (e) => act(e.target, "rules-result", () =>
  api(`/lots/${$("rules-lot").value}/rules`, { minTemp: +$("rules-min").value, maxTemp: +$("rules-max").value, deadlineMinutes: +$("rules-deadline").value }));

$("btn-role").onclick = (e) => act(e.target, "role-result", () =>
  api("/roles", { address: $("role-address").value.trim(), role: +$("role-id").value }));

$("btn-deliver").onclick = (e) => act(e.target, "recipient-result", () => api(`/lots/${$("recipient-lot").value}/deliver`, {}));

$("btn-dispute").onclick = (e) => act(e.target, "recipient-result", () =>
  api(`/lots/${$("recipient-lot").value}/dispute`, { reason: $("dispute-reason").value }));

$("recipient-lot").onchange = updateTraceLink;

// ───────────── Démarrage ─────────────
(async function init() {
  try {
    config = await api("/config");
  } catch (e) {
    $("network").textContent = e.message;
    return;
  }
  show();
  setInterval(refresh, 3000);
})();
