// Fonctions partagées par index.html et lot.html.
const STATUS_BADGE = ["", "", "", "", "", "ok", "bad"];
const ROLE_LABELS = {
  manager: "Gestionnaire (MOA)", supplier: "Fournisseur / Producteur",
  carrier: "Transporteur / Logisticien", recipient: "Destinataire / Client final",
};

// Les erreurs gardent les étapes déjà franchies (affichées dans les coulisses).
async function api(path, body) {
  const r = await fetch(`/api${path}`, body === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw Object.assign(new Error(json.error), { steps: json.steps });
  return json;
}

const short = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : "");
const fmtTime = (ts) => new Date(ts * 1000).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function statusBadge(lot) {
  return `<span class="badge ${STATUS_BADGE[lot.status]}">${esc(lot.statusLabel)}</span>`;
}

// Les drapeaux sont posés par le contrat ; "overdue" signale un retard pas encore constaté on-chain.
function flags(lot) {
  const out = [];
  if (lot.coldChainBreach) out.push('<span class="badge bad">Chaîne du froid</span>');
  if (lot.late) out.push('<span class="badge bad">Retard</span>');
  else if (lot.status < 5 && Date.now() / 1000 > lot.deadline) out.push('<span class="badge warn">Retard (à constater)</span>');
  return out.join(" ") || '<span class="badge ok">Conforme</span>';
}

// Libellé court du réseau pour l'en-tête.
function networkLabel(n) {
  const c = n.consensus.validators.length
    ? `${n.consensus.name} · ${n.consensus.validators.length} validateurs · ${n.peers} pairs`
    : n.consensus.name;
  return `Chaîne ${n.chainId} · ${c} · bloc #${n.block}`;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
}
