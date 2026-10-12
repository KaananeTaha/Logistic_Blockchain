// Point d'entrée : API REST + interface web (dossier frontend/) servie sur le même port.
const path = require("path");
const express = require("express");
const { startKeeper } = require("./keeper");

const app = express();
app.use(express.json());

app.use("/api", require("./routes/admin"));      // config, alertes, rôles (Fct7, Fct8)
app.use("/api/lots", require("./routes/lots"));  // Fct1, Fct2, Fct5, Fct6
app.use("/api/iot", require("./routes/iot"));    // Fct3
app.use(express.static(path.join(__dirname, "..", "..", "frontend")));

startKeeper();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Interface et API : http://localhost:${PORT}`));
