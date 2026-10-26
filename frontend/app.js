// Interface multi-profils. Chaque onglet de profil signe avec le compte actif choisi pour ce rôle ;
// après chaque action, le panneau « coulisses » détaille ce qui s'est passé.
const TABS = [
  ["accounts", "1. Comptes"], ["supplier", "Fournisseur"], ["carrier", "Transporteur"],
  ["manager", "Gestionnaire"], ["recipient", "Destinataire"], ["chain", "Blockchain"],
];
const $ = (id) => document.getElementById(id);

const saved = (() => { try { return JSON.parse(localStorage.getItem("ui") || "{}"); } catch { return {}; } })();
let tab = saved.tab || "accounts";
const active = saved.active || {}; // rôle -> adresse du compte actif
let accounts = [], lots = [];

function persist() {
  try { localStorage.setItem("ui", JSON.stringify({ tab, active })); } catch {}
}

const accountsOf = (role) => accounts.filter((a) => a.role === role);
const activeAccount = (role) =>
  accountsOf(role).find((a) => a.address === active[role]) || accountsOf(role)[0];
const nameOf = (addr) => accounts.find((a) => a.address.toLowerCase() === String(addr).toLowerCase())?.name || short(addr);

// ───────────── Navigation ─────────────
function renderTabs() {
  $("tabs").innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" class="${k === tab ? "active" : ""}">${label}</button>`).join("");
  $("tabs").querySelectorAll("button").forEach((b) => b.onclick = () => { tab = b.dataset.tab; show(); });
}

function show() {
  persist();
  document.querySelectorAll("[data-panel]").forEach((p) => p.hidden = p.dataset.panel !== tab);
  renderTabs();
  refresh();
}

// Barre « compte actif » en tête de chaque onglet de profil, avec sa clé publique.
function renderAccountBars() {
  document.querySelectorAll("[data-role]").forEach((panel) => {
    const role = panel.dataset.role;
    const acc = activeAccount(role);
    const bar = panel.querySelector(".account-bar");
    const options = accountsOf(role).map((a) =>
      `<option value="${a.address}" ${a.address === acc?.address ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    bar.innerHTML = `<div class="card account">
      <label>Compte actif (${ROLE_LABELS[role]})</label>
      <select>${options}</select>
      <div class="keys"><span class="muted">Adresse</span><span class="mono">${acc?.address || "-"}</span>
      <span class="muted">Clé publique</span><span class="mono">${acc?.publicKey || "-"}</span></div></div>`;
    bar.querySelector("select").onchange = (e) => { active[role] = e.target.value; persist(); renderAccountBars(); };
  });
}

// ───────────── Rafraîchissement (toutes les 3 s) ─────────────
async function refresh() {
  try {
    const [net, accs, lotList] = await Promise.all([api("/network"), api("/accounts"), api("/lots")]);
    $("network").textContent = networkLabel(net);
    const changed = JSON.stringify(accs) !== JSON.stringify(accounts);
    accounts = accs;
    lots = lotList;
    if (changed) { renderAccountBars(); renderAccountsTable(); fillRecipients(); }
    fillSelects();
    if (tab === "supplier") renderLotTable("supplier-lots", lots, false);
    if (tab === "manager") renderManager();
    if (tab === "chain") renderChain(net);
    updateTraceLink();
  } catch (e) {
    $("network").textContent = e.message;
  }
}

function renderAccountsTable() {
  $("accounts-table").innerHTML = "<tr><th>Nom</th><th>Rôle</th><th>Adresse et clé publique</th></tr>" +
    accounts.slice().reverse().map((a) => `<tr><td>${esc(a.name)}</td><td>${ROLE_LABELS[a.role]}</td>
      <td><span class="mono">${a.address}</span><br><span class="mono muted">${a.publicKey}</span></td></tr>`).join("");
}

function fillRecipients() {
  const sel = $("recipient-choice");
  const keep = sel.value;
  sel.innerHTML = accountsOf("recipient").map((a) => `<option value="${a.address}">${esc(a.name)}</option>`).join("");
  if (keep) sel.value = keep;
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
  $(id).innerHTML = `<tr><th>Lot</th><th>Nature</th><th>Fournisseur → Destinataire</th><th>Statut</th><th>Contrôles</th>${withRules ? "<th>Plage</th><th>Échéance</th>" : ""}</tr>` +
    (list.slice().reverse().map((l) => `<tr>
      <td><a class="mono" href="lot.html?id=${l.id}" target="_blank">${short(l.id)}</a></td>
      <td>${esc(l.nature)} × ${l.quantity}</td>
      <td>${esc(nameOf(l.supplier))} → ${esc(nameOf(l.recipient))}</td>
      <td>${statusBadge(l)}</td><td>${flags(l)}</td>
      ${withRules ? `<td>${l.minTemp / 10}–${l.maxTemp / 10} °C</td><td>${fmtTime(l.deadline)}</td>` : ""}
    </tr>`).join("") || "<tr><td colspan='7' class='muted'>Aucun lot pour l'instant.</td></tr>");
}

async function renderManager() {
  const count = (f) => lots.filter(f).length;
  const kpi = [
    ["Lots", lots.length], ["En cours", count((l) => l.status < 5)], ["Livrés", count((l) => l.status === 5)],
    ["Litiges", count((l) => l.status === 6)], ["Ruptures du froid", count((l) => l.coldChainBreach)],
    ["En retard", count((l) => l.late)], ["Comptes", accounts.length],
  ];
  $("kpis").innerHTML = kpi.map(([k, v]) => `<div class="kpi"><span class="muted">${k}</span><b>${v}</b></div>`).join("");
  renderLotTable("manager-lots", lots, true);

  const alerts = await api("/alerts");
  $("alerts").innerHTML = "<tr><th>Heure</th><th>Lot</th><th>Alerte</th></tr>" +
    (alerts.map((a) => `<tr><td>${fmtTime(a.timestamp)}</td>
      <td><a class="mono" href="lot.html?id=${a.lotId}" target="_blank">${short(a.lotId)}</a></td>
      <td><span class="badge bad">${esc(a.reason)}</span></td></tr>`).join("") || "<tr><td colspan='3' class='muted'>Aucune alerte.</td></tr>");
}

async function renderChain(net) {
  const c = net.consensus;
  $("network-card").innerHTML = `<h2>Réseau et consensus</h2>
    <div class="keys">
      <span class="muted">Logiciel du nœud</span><span>${esc(net.client)}</span>
      <span class="muted">Identifiant de chaîne</span><span>${net.chainId}</span>
      <span class="muted">Nœud interrogé</span><span class="mono">${esc(net.rpc)}</span>
      <span class="muted">Consensus</span><span>${esc(c.name)}${c.validators.length ? ` · un bloc est accepté quand ${c.quorum} des ${c.validators.length} validateurs l'approuvent` : ""}</span>
      <span class="muted">Pairs connectés</span><span>${net.peers}</span>
      <span class="muted">Contrat</span><span class="mono">${net.contract}</span>
      <span class="muted">Gaz</span><span>${net.freeGas ? "gratuit (réseau privé)" : "payant en ETH de test"}</span>
    </div>
    ${c.validators.length ? `<h3>Validateurs</h3><ul class="mono">${c.validators.map((v) => `<li>${v}</li>`).join("")}</ul>`
      : '<p class="muted">Un seul nœud, donc aucun vote : c\'est le mode développement. Sur le réseau Besu, cette carte liste les 4 validateurs.</p>'}`;

  const blocks = await api("/explorer?count=8");
  $("blocks").innerHTML = blocks.map((b) => `<div class="block">
      <div class="block-head"><b>Bloc #${b.number}</b><span class="muted">${fmtTime(b.timestamp)}</span></div>
      <div class="keys"><span class="muted">Hash</span><span class="mono">${b.hash}</span>
      <span class="muted">Bloc précédent</span><span class="mono">${b.parentHash}</span></div>
      ${b.txs.map((t) => `<div class="tx"><b>${esc(t.call)}</b><br>
        <span class="muted">signé par</span> ${esc(t.signer)}<br>
        <span class="muted">clé publique (retrouvée depuis la signature)</span> <span class="mono">${t.publicKey || "?"}</span></div>`).join("")
        || '<div class="tx muted">Aucune transaction</div>'}
    </div>`).join('<div class="link">↑ ce bloc référence le hash du précédent</div>');
}

function updateTraceLink() {
  const id = $("recipient-lot").value;
  $("recipient-trace").href = id ? `lot.html?id=${id}` : "#";
}

// ───────────── Coulisses ─────────────
function showCoulisses(ok, summary, steps = []) {
  $("coulisses").hidden = false;
  $("coulisses-result").innerHTML = `<div class="result ${ok ? "ok" : "bad"}">${summary}</div>`;
  $("coulisses-steps").innerHTML = steps.map((s) =>
    `<li class="${s.kind}"><b>${esc(s.title)}</b><pre>${esc(s.detail)}</pre></li>`).join("");
}

// Exécute une action, affiche les coulisses et rafraîchit les données.
async function act(button, fn, describe = () => "Transaction validée") {
  button.disabled = true;
  try {
    const r = await fn();
    const alert = r.anomalies?.length ? ` · ⚠ ${r.anomalies.join(", ")}` : "";
    showCoulisses(true, `${describe(r)}${r.block !== undefined ? ` · bloc #${r.block}` : ""}${alert}`, r.steps);
    toast(alert ? `Alerte déclenchée par le Smart Contract${alert}` : "Transaction inscrite sur la blockchain");
    await refresh();
    return r;
  } catch (e) {
    showCoulisses(false, `Refusé : ${esc(e.message)}`, e.steps);
  } finally {
    button.disabled = false;
    $("coulisses").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

const as = (role) => activeAccount(role)?.address;

$("account-form").onsubmit = (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  act(ev.target.querySelector("button"), async () => {
    const r = await api("/accounts", { name: f.name, role: f.role });
    active[f.role] = r.address; // le nouveau compte devient le compte actif de son rôle
    persist();
    return r;
  }, (r) => `Compte « ${esc(f.name)} » créé : ${short(r.address)}`);
};

$("create-form").onsubmit = (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  act(ev.target.querySelector("button"), async () => {
    const r = await api("/lots", {
      account: as("supplier"), recipient: f.recipient,
      nature: f.nature, quantity: +f.quantity, minTemp: +f.minTemp, maxTemp: +f.maxTemp, deadlineMinutes: +f.deadlineMinutes,
      privateData: { numeroLot: f.numeroLot, prixUnitaireMAD: +f.prix },
    });
    $("create-result").innerHTML = `<div class="qr"><img src="/api/lots/${r.lotId}/qrcode" alt="QR Code du lot">
      <div><b>Lot enregistré</b><div class="mono">${r.lotId}</div>
      <p><a href="lot.html?id=${r.lotId}" target="_blank">Ouvrir la page de traçabilité →</a></p></div></div>`;
    return r;
  }, () => "Lot inscrit sur la blockchain");
};

$("btn-status").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("carrier-lot").value}/status`, { account: as("carrier"), status: +$("carrier-status").value, note: $("carrier-note").value }),
  () => "Étape de transport enregistrée");

$("btn-iot").onclick = (e) => act(e.target, () => {
  const [lat, lon] = $("iot-pos").value.split(",").map(Number);
  return api(`/iot/${$("carrier-lot").value}`, { account: as("carrier"), temperature: +$("iot-temp").value, lat, lon });
}, () => "Mesure capteur enregistrée");

$("btn-rules").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("rules-lot").value}/rules`, { account: as("manager"), minTemp: +$("rules-min").value, maxTemp: +$("rules-max").value, deadlineMinutes: +$("rules-deadline").value }),
  () => "Règles mises à jour");

$("btn-role").onclick = (e) => act(e.target, () =>
  api("/roles", { account: as("manager"), address: $("role-address").value.trim(), role: +$("role-id").value }),
  () => "Rôle attribué");

$("btn-deliver").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("recipient-lot").value}/deliver`, { account: as("recipient") }), () => "Réception validée et signée");

$("btn-dispute").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("recipient-lot").value}/dispute`, { account: as("recipient"), reason: $("dispute-reason").value }),
  () => "Litige ouvert");

$("recipient-lot").onchange = updateTraceLink;

// ───────────── Démarrage ─────────────
show();
setInterval(refresh, 3000);
