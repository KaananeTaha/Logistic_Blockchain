// « Keeper » : un contrat ne s'exécute jamais tout seul. Si un lot dépasse sa date limite sans
// qu'aucune transaction ne le touche, personne ne déclenche l'alerte. Ce petit service vérifie
// périodiquement les lots en retard et appelle checkDeadline() pour que la règle s'applique.
const { contract, send, readLot } = require("./chain");

const DELIVERED = 5, DISPUTED = 6;

async function sweep() {
  const now = Math.floor(Date.now() / 1000);
  for (const id of await contract.getLotIds()) {
    const lot = await readLot(id);
    if (!lot.late && lot.status !== DELIVERED && lot.status !== DISPUTED && now > lot.deadline) {
      await send("manager", "checkDeadline", id);
      console.log(`[keeper] délai dépassé constaté on-chain pour ${id.slice(0, 10)}…`);
    }
  }
}

function startKeeper(intervalMs = 10_000) {
  setInterval(() => sweep().catch((e) => console.error("[keeper]", e.shortMessage || e.message)), intervalMs);
}

module.exports = { startKeeper };
