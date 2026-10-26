// Point d'entrée : API REST + interface web (dossier frontend/) servie sur le même port.
const path = require("path");
const express = require("express");
const chain = require("./chain");
const { startKeeper } = require("./keeper");

const app = express();
app.use(express.json());

app.use("/api", require("./routes/admin"));             // réseau, explorateur, alertes, rôles (Fct7, Fct8)
app.use("/api/accounts", require("./routes/accounts")); // création de comptes (étape 1 du parcours)
app.use("/api/lots", require("./routes/lots"));         // Fct1, Fct2, Fct5, Fct6
app.use("/api/iot", require("./routes/iot"));           // Fct3
app.use(express.static(path.join(__dirname, "..", "..", "frontend")));

chain.init().then(async () => {
  const info = await chain.networkInfo();
  console.log(`Blockchain : ${info.client} · chaîne ${info.chainId} · consensus ${info.consensus.name}`);
  startKeeper();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log(`Interface et API : http://localhost:${PORT}`));
}).catch((e) => {
  console.error(`Blockchain injoignable (${process.env.RPC_URL || "http://127.0.0.1:8545"}) : ${e.shortMessage || e.message}`);
  process.exit(1);
});
