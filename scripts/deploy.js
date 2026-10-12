// Déploie le contrat, attribue un rôle à chaque compte de démo et écrit deployment.json
// (adresse + ABI), que le backend lit au démarrage.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ROLES, walletFor } = require("../config/demo-accounts");

async function main() {
  const C = await hre.ethers.getContractFactory("LogisticsTraceability");
  const c = await C.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log(`LogisticsTraceability déployé à ${address} (réseau ${hre.network.name})`);

  for (const [name, r] of Object.entries(ROLES)) {
    if (name === "manager") continue; // déjà Gestionnaire via le constructeur
    const account = walletFor(name).address;
    await (await c.grantRole(account, r.roleId)).wait();
    console.log(`  ${r.label.padEnd(28)} ${account}`);
  }

  const artifact = await hre.artifacts.readArtifact("LogisticsTraceability");
  const out = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(out, JSON.stringify({ network: hre.network.name, address, abi: artifact.abi }, null, 2));
  console.log("deployment.json écrit.");
}

main().catch((e) => { console.error(e); process.exit(1); });
