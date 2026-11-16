// Interface unique de l'application. Elle suit trois états :
//   1. machine vierge        → assistant « créer / rejoindre un réseau » ;
//   2. nœud démarré          → connexion ou création d'un compte utilisateur ;
//   3. utilisateur connecté  → l'onglet de son rôle (lu sur la blockchain), le réseau, l'explorateur.
// Après chaque action, le panneau « coulisses » détaille ce qui s'est passé.
const $ = (id) => document.getElementById(id);

let state = {};         // /api/state : phase de la machine
let user = null;        // compte connecté (rôle lu on-chain)
let localAccounts = []; // comptes enregistrés sur cette machine
let members = [], lots = [];
let tab = (() => { try { return localStorage.getItem("tab"); } catch { return null; } })();

const nameOf = (addr) => members.find((m) => m.address.toLowerCase() === String(addr).toLowerCase())?.name || short(addr);
const roleBadge = (role) => (role ? `<span class="badge ok">${ROLE_LABELS[role]}</span>` : '<span class="badge warn">Aucun rôle</span>');

// ───────────── Aiguillage ─────────────
function view(name) {
  for (const v of ["wait", "setup", "app"]) $(`view-${v}`).hidden = v !== name;
}

function tabs() {
  const list = user ? [["account", "Mon compte"]] : [["login", "Connexion"]];
  if (user?.role && state.synced) list.push([user.role, ROLE_LABELS[user.role].split(" ")[0]]);
  list.push(["network", "Réseau"]);
  if (state.synced) list.push(["chain", "Blockchain"]);
  return list;
}

function show() {
  const list = tabs();
  if (!list.some(([k]) => k === tab)) tab = list[user?.role && state.synced ? 1 : 0][0];
  try { localStorage.setItem("tab", tab); } catch {}
  $("tabs").innerHTML = list.map(([k, label]) => `<button data-tab="${k}" class="${k === tab ? "active" : ""}">${label}</button>`).join("");
  $("tabs").querySelectorAll("button").forEach((b) => b.onclick = () => { tab = b.dataset.tab; show(); refresh(); });
  document.querySelectorAll("[data-panel]").forEach((p) => p.hidden = p.dataset.panel !== tab);
}

// ───────────── Boucle principale (toutes les 3 s) ─────────────
async function refresh() {
  try {
    state = await api("/state");
  } catch {
    view("wait");
    $("wait-title").textContent = "Application injoignable";
    $("wait-message").textContent = "Relancez-la sur cette machine (npm start).";
    return;
  }
  if (state.phase === "setup") return renderSetup();
  if (state.phase !== "ready") {
    view("wait");
    $("wait-title").textContent = state.phase === "error" ? "Le nœud n'a pas pu démarrer" : `${state.network || "Démarrage"}…`;
    $("wait-message").textContent = state.error || state.message;
    return;
  }

  view("app");
  $("banner").innerHTML = (state.warning ? `<div class="banner">${esc(state.warning)}</div>` : "") + (state.synced ? ""
    : '<div class="banner">Ce nœud n\'a pas encore rattrapé la blockchain du réseau. Dès qu\'il sera connecté à un pair, la synchronisation se fera seule : suivez-la dans l\'onglet Réseau.</div>');
  try {
    const me = await api("/auth/me");
    const changed = JSON.stringify([user, localAccounts]) !== JSON.stringify([me.user, me.accounts]);
    user = me.user;
    localAccounts = me.accounts;
    if (changed) { show(); renderLogin(); renderAccount(); }
    if (!$("tabs").children.length) show();

    if (state.synced) {
      const [net, m, l] = await Promise.all([api("/network"), api("/members"), api("/lots")]);
      $("network").textContent = `${net.name} · ${networkLabel(net)}`;
      members = m;
      lots = l;
      show(); // un rôle vient peut-être d'être attribué
      fillRecipients();
      fillSelects();
      if (tab === "supplier") renderLotTable("supplier-lots", lots, false);
      if (tab === "manager") renderManager();
      if (tab === "chain") renderChain(net);
      updateTraceLink();
    } else {
      $("network").textContent = `${state.network} · synchronisation…`;
      show();
    }
    if (tab === "network") renderNetwork();
  } catch (e) {
    $("network").textContent = e.message;
  }
}

// ───────────── 1. Assistant de configuration ─────────────
let setupDrawn = false;
function renderSetup() {
  view("setup");
  $("network").textContent = "";
  $("setup-error").innerHTML = state.error ? `<div class="result bad">${esc(state.error)}</div>` : "";
  $("setup-forms").hidden = !state.local;
  $("setup-tools").textContent = !state.local
    ? `La configuration se fait depuis la machine elle-même, à l'adresse http://localhost:${location.port || 80}.`
    : state.besuInstalled ? "Besu et Java sont installés : le nœud démarrera en quelques secondes."
    : "Besu et Java seront téléchargés automatiquement au premier démarrage (environ 250 Mo, quelques minutes). Rien n'est installé dans le système.";
  if (setupDrawn || !state.local) return;
  setupDrawn = true;
  document.querySelectorAll("[name=nodeName]").forEach((i) => i.value = state.hostname || "");
  $("create-network").host.innerHTML = [...state.ips, { name: "cette machine uniquement", ip: "127.0.0.1" }]
    .map((i) => `<option value="${i.ip}">${i.ip} (${esc(i.name)})</option>`).join("");
}

async function startSetup(form, path) {
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api(path, Object.fromEntries(new FormData(form)));
    form.querySelectorAll("[type=password]").forEach((i) => i.value = "");
    await refresh();
  } catch (e) {
    $("setup-error").innerHTML = `<div class="result bad">${esc(e.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}
$("create-network").onsubmit = (ev) => { ev.preventDefault(); startSetup(ev.target, "/setup/create"); };
$("join-network").onsubmit = (ev) => { ev.preventDefault(); startSetup(ev.target, "/setup/join"); };

// ───────────── 2. Connexion et compte ─────────────
function renderLogin() {
  $("login-account").innerHTML = localAccounts.map((a) => `<option value="${a.address}">${esc(a.name)} · ${short(a.address)}</option>`).join("")
    || "<option value=''>Aucun compte sur cette machine</option>";
  $("login-form").querySelector("button").disabled = !localAccounts.length;
}

function renderAccount() {
  if (!user) return;
  const pending = user.requested
    ? `<div class="result ok">Demande envoyée pour le rôle « ${ROLE_LABELS[user.requested]} » : en attente de la validation du Gestionnaire. Cette page se met à jour toute seule.</div>` : "";
  const ask = !user.role && !user.requested && state.synced ? `<label>Demander un rôle</label>
    <select id="ask-role">${Object.entries(ROLE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    <div class="actions"><button id="btn-ask">Envoyer la demande</button></div>` : "";
  $("account-card").innerHTML = `<h2>${esc(user.name)} ${roleBadge(user.role)}</h2>
    <div class="keys"><span class="muted">Adresse</span><span class="mono">${user.address}</span>
    <span class="muted">Clé publique</span><span class="mono">${user.publicKey}</span>
    <span class="muted">Clé privée</span><span>chiffrée sur cette machine, déverrouillée pour cette session</span></div>
    ${pending}${ask}
    <div class="actions"><button class="secondary" id="btn-logout">Se déconnecter</button></div>`;
  $("btn-logout").onclick = async () => { await api("/auth/logout", {}); $("coulisses").hidden = true; refresh(); };
  if ($("btn-ask")) $("btn-ask").onclick = (e) => act(e.target, () => api("/auth/request", { role: $("ask-role").value }), () => "Demande d'accès envoyée");
}

$("login-form").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  try {
    await api("/auth/login", f);
    ev.target.password.value = "";
    $("login-result").innerHTML = "";
    tab = null;
    await refresh();
  } catch (e) {
    $("login-result").innerHTML = `<div class="result bad">${esc(e.message)}</div>`;
  }
};

$("register-form").onsubmit = (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  act(ev.target.querySelector("button"), async () => {
    const r = await api("/auth/register", f);
    ev.target.reset();
    tab = "account";
    return r;
  }, (r) => `Compte « ${esc(f.name)} » créé : ${short(r.address)}`);
};

// ───────────── 3. Profils ─────────────
function fillRecipients() {
  const sel = $("recipient-choice");
  const keep = sel.value;
  sel.innerHTML = members.filter((m) => m.role === "recipient").map((a) => `<option value="${a.address}">${esc(a.name)}</option>`).join("")
    || "<option value=''>Aucun destinataire validé pour l'instant</option>";
  if (keep) sel.value = keep;
}

function fillSelects() {
  document.querySelectorAll(".lot-select").forEach((sel) => {
    const keep = sel.value;
    let list = lots.filter((l) => l.status < 5);
    if (sel.dataset.filter === "mine") list = list.filter((l) => l.recipient === user?.address);
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
  const requests = members.filter((m) => m.requested);
  const kpi = [
    ["Lots", lots.length], ["En cours", count((l) => l.status < 5)], ["Livrés", count((l) => l.status === 5)],
    ["Litiges", count((l) => l.status === 6)], ["Ruptures du froid", count((l) => l.coldChainBreach)],
    ["En retard", count((l) => l.late)], ["Demandes d'accès", requests.length],
  ];
  $("kpis").innerHTML = kpi.map(([k, v]) => `<div class="kpi"><span class="muted">${k}</span><b>${v}</b></div>`).join("");

  $("requests").innerHTML = "<tr><th>Acteur</th><th>Adresse</th><th>Rôle demandé</th><th></th></tr>" +
    (requests.map((m) => `<tr><td>${esc(m.name)}</td><td class="mono">${m.address}</td><td>${ROLE_LABELS[m.requested]}</td>
      <td><div class="actions"><button class="small" data-grant="${m.address}" data-role="${ROLE_IDS[m.requested]}">Valider</button>
      <button class="small secondary" data-grant="${m.address}" data-role="${ROLE_IDS[m.role] || 0}">Refuser</button></div></td></tr>`).join("")
      || "<tr><td colspan='4' class='muted'>Aucune demande en attente.</td></tr>");
  $("members").innerHTML = "<tr><th>Acteur</th><th>Rôle</th><th>Adresse</th><th></th></tr>" +
    members.map((m) => `<tr><td>${esc(m.name)}</td><td>${roleBadge(m.role)}</td><td class="mono">${m.address}</td>
      <td>${m.role && m.address !== user.address ? `<button class="small secondary" data-grant="${m.address}" data-role="0">Retirer le rôle</button>` : ""}</td></tr>`).join("");
  document.querySelectorAll("[data-grant]").forEach((b) => b.onclick = () =>
    act(b, () => api("/roles", { address: b.dataset.grant, role: +b.dataset.role }), () => (+b.dataset.role ? "Rôle attribué" : "Accès refusé ou retiré")));

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

// ───────────── Réseau : nœuds, validateurs, diagnostic ─────────────
async function renderNetwork() {
  const n = await api("/network/status");
  const health = n.validatorsOnline >= n.quorum
    ? `<span class="badge ok">Réseau opérationnel</span>`
    : `<span class="badge bad">En pause : ${n.validatorsOnline} validateur(s) en ligne sur ${n.validators}, il en faut ${n.quorum}</span>`;
  const self = n.nodes.find((x) => x.self);
  $("net-summary").innerHTML = `<h2>${esc(n.name)} ${health}</h2>
    <div class="keys">
      <span class="muted">Cette machine</span><span>${esc(self.name)} · ${self.isValidator ? "validateur" : "nœud (ne vote pas)"} · annoncée à l'adresse <span class="mono">${self.host}:${self.p2pPort}</span></span>
      <span class="muted">Dernier bloc</span><span>#${n.block}${n.syncing ? " (synchronisation en cours)" : ""}</span>
      <span class="muted">Pairs connectés</span><span>${n.peers} sur ${n.nodes.length - 1} autre(s) nœud(s) connu(s)</span>
      <span class="muted">Consensus</span><span>QBFT · ${n.validators} validateur(s) · un bloc est accepté quand ${n.quorum} l'approuvent · tolère ${Math.floor((n.validators - 1) / 3)} panne(s)</span>
    </div>`;

  $("net-invite").hidden = $("net-admin").hidden = !n.local;
  if (n.local) {
    $("net-invite").innerHTML = `<h2>Inviter une machine</h2>
      <p class="muted">Sur l'autre machine : lancer l'application, choisir « Rejoindre un réseau », puis saisir :</p>
      <div class="invite"><div><span class="muted">Adresse</span>${n.invite.addresses.map((a) => `<b>${a}</b>`).join("") || "<b>aucune interface réseau</b>"}</div>
      <div><span class="muted">Code d'invitation</span><b>${n.invite.code}</b></div></div>`;
    const sel = $("host-choice");
    if (document.activeElement !== sel) {
      sel.innerHTML = [...new Set([n.invite.host, ...n.invite.ips.map((i) => i.ip), "127.0.0.1"])]
        .map((ip) => `<option ${ip === n.invite.host ? "selected" : ""}>${ip}</option>`).join("");
    }
  }

  const canVote = n.local && n.iAmValidator;
  $("net-nodes").innerHTML = "<tr><th>Machine</th><th>Adresse</th><th>Connexion</th><th>Rôle dans le consensus</th><th></th></tr>" +
    n.nodes.map((x) => {
      const votes = x.votes ? ` <span class="muted">${x.votes} vote(s) sur ${n.votesNeeded} pour ${x.isValidator ? "le retirer" : "l'ajouter"}</span>` : "";
      const vote = !canVote || x.self ? "" : x.votedByMe ? '<span class="muted">Vous avez voté</span>'
        : `<button class="small ${x.isValidator ? "secondary" : ""}" data-vote="${x.validator}" data-add="${!x.isValidator}">${x.isValidator ? "Voter son retrait" : "Voter pour l'ajouter aux validateurs"}</button>`;
      const forget = n.local && !x.self && !x.connected ? `<button class="small secondary" data-forget="${x.id}">Oublier</button>` : "";
      return `<tr><td>${esc(x.name)}${x.self ? ' <span class="muted">(cette machine)</span>' : ""}</td>
        <td class="mono">${x.host}:${x.p2pPort}</td>
        <td>${x.self ? "" : x.connected ? '<span class="badge ok">Connecté</span>' : '<span class="badge bad">Non connecté</span>'}</td>
        <td>${x.isValidator ? '<span class="badge ok">Validateur</span>' : '<span class="badge">Nœud</span>'}${votes}</td>
        <td><div class="actions">${vote}${forget}</div></td></tr>`;
    }).join("");
  document.querySelectorAll("[data-vote]").forEach((b) => b.onclick = () =>
    netAction(b, "/network/vote", { validator: b.dataset.vote, add: b.dataset.add === "true" }, "Vote enregistré : il sera inscrit dans le prochain bloc proposé par cette machine."));
  document.querySelectorAll("[data-forget]").forEach((b) => b.onclick = () => netAction(b, "/network/forget", { id: b.dataset.forget }, "Nœud retiré de l'annuaire."));
}

async function netAction(button, path, body, done) {
  button.disabled = true;
  try {
    await api(path, body);
    toast(done);
  } catch (e) {
    toast(e.message);
  }
  button.disabled = false;
  refresh();
}

$("btn-diagnose").onclick = async (e) => {
  e.target.disabled = true;
  $("net-diagnosis").innerHTML = '<p class="muted">Test des connexions…</p>';
  try {
    const d = await api("/network/diagnose");
    const yes = (v) => (v === null ? "?" : v ? "✓" : "✗");
    $("net-diagnosis").innerHTML = d.general.map((g) => `<div class="result bad">${esc(g)}</div>`).join("") + (d.results.length ? `
      <div class="table-wrap"><table><tr><th>Machine</th><th>Application</th><th>Port P2P sortant</th><th>Port P2P entrant</th><th>Constat</th></tr>
      ${d.results.map((r) => `<tr><td>${esc(r.name)}<br><span class="mono muted">${r.host}</span></td><td>${yes(r.appReachable)}</td><td>${yes(r.p2pOut)}</td><td>${yes(r.p2pIn)}</td>
        <td>${esc(r.advice)}</td></tr>`).join("")}</table></div>` : "") +
      `<details><summary class="muted">Dernières lignes du journal du nœud</summary><pre>${esc(d.log.join("\n"))}</pre></details>`;
  } catch (err) {
    $("net-diagnosis").innerHTML = `<div class="result bad">${esc(err.message)}</div>`;
  }
  e.target.disabled = false;
};

$("btn-host").onclick = (e) => netAction(e.target, "/network/host", { host: $("host-choice").value }, "Redémarrage du nœud avec la nouvelle adresse…");
$("btn-reconnect").onclick = (e) => netAction(e.target, "/network/reconnect", { address: $("reconnect-address").value }, "Annuaire mis à jour : connexion aux nœuds en cours.");
$("btn-leave").onclick = async (e) => {
  if (!confirm("Quitter le réseau ? La copie de la blockchain de cette machine sera effacée.")) return;
  e.target.disabled = true;
  await api("/setup/leave", {}).catch((err) => toast(err.message));
  e.target.disabled = false;
  setupDrawn = false;
  refresh();
};

// ───────────── Blockchain : consensus et explorateur ─────────────
async function renderChain(net) {
  const c = net.consensus;
  $("network-card").innerHTML = `<h2>Chaîne et consensus</h2>
    <div class="keys">
      <span class="muted">Logiciel du nœud</span><span>${esc(net.client)}</span>
      <span class="muted">Identifiant de chaîne</span><span>${net.chainId}</span>
      <span class="muted">Consensus</span><span>${esc(c.name)} · un bloc est accepté quand ${c.quorum} des ${c.validators.length} validateurs l'approuvent</span>
      <span class="muted">Contrat</span><span class="mono">${net.contract}</span>
      <span class="muted">Gaz</span><span>gratuit (réseau privé)</span>
    </div>`;

  const blocks = await api("/explorer?count=8");
  $("blocks").innerHTML = blocks.map((b) => `<div class="block">
      <div class="block-head"><b>Bloc #${b.number}</b><span class="muted">proposé par ${esc(b.proposer)} · ${fmtTime(b.timestamp)}</span></div>
      <div class="keys"><span class="muted">Hash</span><span class="mono">${b.hash}</span>
      <span class="muted">Bloc précédent</span><span class="mono">${b.parentHash}</span></div>
      ${b.txs.map((t) => `<div class="tx"><b>${esc(t.call)}</b><br>
        <span class="muted">signé par</span> ${esc(t.signer)}<br>
        <span class="muted">clé publique (retrouvée depuis la signature)</span> <span class="mono">${t.publicKey || "?"}</span></div>`).join("")
        || '<div class="tx muted">Aucune transaction</div>'}
    </div>`).join('<div class="link">↑ ce bloc référence le hash du précédent</div>');
}

// ───────────── Coulisses ─────────────
function showCoulisses(ok, summary, steps = []) {
  $("coulisses").hidden = false;
  $("coulisses-result").innerHTML = `<div class="result ${ok ? "ok" : "bad"}">${summary}</div>`;
  $("coulisses-steps").innerHTML = steps.map((s) =>
    `<li class="${s.kind}"><b>${esc(s.title)}</b><pre>${esc(s.detail)}</pre></li>`).join("");
}

// Exécute une action signée par le compte connecté, affiche les coulisses et rafraîchit les données.
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

$("create-form").onsubmit = (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  act(ev.target.querySelector("button"), async () => {
    const r = await api("/lots", {
      recipient: f.recipient,
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
  api(`/lots/${$("carrier-lot").value}/status`, { status: +$("carrier-status").value, note: $("carrier-note").value }),
  () => "Étape de transport enregistrée");

$("btn-iot").onclick = (e) => act(e.target, () => {
  const [lat, lon] = $("iot-pos").value.split(",").map(Number);
  return api(`/iot/${$("carrier-lot").value}`, { temperature: +$("iot-temp").value, lat, lon });
}, () => "Mesure capteur enregistrée");

$("btn-rules").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("rules-lot").value}/rules`, { minTemp: +$("rules-min").value, maxTemp: +$("rules-max").value, deadlineMinutes: +$("rules-deadline").value }),
  () => "Règles mises à jour");

$("btn-deliver").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("recipient-lot").value}/deliver`, {}), () => "Réception validée et signée");

$("btn-dispute").onclick = (e) => act(e.target, () =>
  api(`/lots/${$("recipient-lot").value}/dispute`, { reason: $("dispute-reason").value }),
  () => "Litige ouvert");

$("recipient-lot").onchange = updateTraceLink;

// ───────────── Démarrage ─────────────
refresh();
setInterval(refresh, 3000);
