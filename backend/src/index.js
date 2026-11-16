// Point d'entrée de l'application : une seule commande lance l'interface web, l'API et (une fois la
// machine configurée) le nœud Besu local. Tout se pilote ensuite depuis le navigateur.
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const config = require("./config");
const besu = require("./besu");
const node = require("./node");
const chain = require("./chain");

const app = express();
app.use(express.json());

// Les routes qui lisent ou écrivent le contrat attendent que ce nœud ait rattrapé le réseau.
const synced = (req, res, next) => chain.ready ? next()
  : res.status(503).json({ error: "Ce nœud n'est pas encore synchronisé avec le réseau (voir l'onglet Réseau)." });
const started = (req, res, next) => node.state.phase === "ready" ? next()
  : res.status(503).json({ error: "Le nœud de cette machine n'est pas démarré." });

app.use("/api", require("./routes/setup"));                       // état, création / adhésion au réseau
app.use("/api/network", require("./routes/network"));             // nœuds, pairs, validateurs, diagnostic
app.use("/api/auth", started, require("./routes/auth"));          // comptes utilisateurs et sessions
app.use("/api/lots", synced, require("./routes/lots"));           // Fct1, Fct2, Fct5, Fct6
app.use("/api/iot", synced, require("./routes/iot"));             // Fct3
app.use("/api", synced, require("./routes/admin"));               // explorateur, alertes, annuaire, rôles (Fct7, Fct8)
app.use(express.static(path.join(__dirname, "..", "..", "frontend")));

const server = app.listen(config.PORT, "0.0.0.0", () => {
  const url = `http://localhost:${config.PORT}`;
  console.log(`Application : ${url}   (données : ${config.HOME})`);
  node.boot();
  if (!process.env.NO_OPEN) {
    const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }
});
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE"
    ? `Le port ${config.PORT} est déjà utilisé : l'application tourne peut-être déjà (http://localhost:${config.PORT}). Sinon : PORT=3001 npm start`
    : e.message);
  process.exit(1);
});

// Fermer l'application arrête aussi le nœud ; la chaîne reste sur disque et repart au prochain lancement.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { besu.stop(); process.exit(0); });
}
