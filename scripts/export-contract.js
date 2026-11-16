// Copie l'ABI et le bytecode compilés dans backend/contract.json. L'application déploie le contrat
// elle-même à la création d'un réseau : les machines qui la lancent n'ont donc pas besoin de Hardhat.
// Lancé par `npm run compile` ; à refaire (et à commiter) après toute modification du contrat.
const fs = require("fs");
const path = require("path");

const artifact = require("../artifacts/contracts/LogisticsTraceability.sol/LogisticsTraceability.json");
const out = path.join(__dirname, "..", "backend", "contract.json");
fs.writeFileSync(out, JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode }));
console.log(`backend/contract.json écrit (${artifact.abi.length} entrées d'ABI).`);
