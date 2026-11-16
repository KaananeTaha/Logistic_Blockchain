// « Keeper » : un contrat ne s'exécute jamais tout seul. Si un lot dépasse sa date limite sans
// qu'aucune transaction ne le touche, personne ne déclenche l'alerte. Chaque nœud vérifie donc
// périodiquement les lots en retard et appelle checkDeadline() (fonction ouverte à tous), en signant
// avec sa propre clé de nœud : aucun utilisateur n'a besoin d'être connecté.
const chain = require("./chain");
const besu = require("./besu");

const DELIVERED = 5, DISPUTED = 6;

async function sweep() {
  const now = Math.floor(Date.now() / 1000);
  for (const id of await chain.contract.getLotIds()) {
    const lot = await chain.readLot(id);
    if (!lot.late && lot.status !== DELIVERED && lot.status !== DISPUTED && now > lot.deadline) {
      // Tous les nœuds font cette ronde : une attente aléatoire évite qu'ils envoient tous la même transaction.
      await new Promise((r) => setTimeout(r, Math.random() * 6000));
      if ((await chain.readLot(id)).late) continue;
      await chain.send(besu.identity().wallet, "checkDeadline", [id]);
      console.log(`[keeper] délai dépassé constaté on-chain pour ${id.slice(0, 10)}…`);
    }
  }
}

module.exports = { sweep };
