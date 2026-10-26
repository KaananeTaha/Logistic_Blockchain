// Simule le capteur embarqué d'un camion frigorifique sur le trajet Casablanca → Benguerir → Marrakech.
// Usage : npm run iot -- <lotId> [--break] [--steps 10] [--interval 2] [--account 0x…]
//   --break : à mi-parcours, la température dépasse le seuil (panne du groupe froid).
const API = process.env.API_URL || "http://localhost:3000";

const args = process.argv.slice(2);
const optStr = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const account = optStr("account"); // compte Transporteur qui signe (défaut : compte de démo)
const lotId = args.find((a) => a.startsWith("0x") && a !== account);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : def; };
const steps = opt("steps", 10);
const intervalS = opt("interval", 2);
const breakChain = args.includes("--break");

if (!lotId) {
  console.error("Usage : npm run iot -- <lotId> [--break] [--steps 10] [--interval 2]");
  process.exit(1);
}

const ROUTE = [[33.5731, -7.5898], [32.2359, -7.9545], [31.6295, -7.9811]];

function position(t) { // t entre 0 et 1, interpolation linéaire sur les étapes du trajet
  const seg = Math.min(Math.floor(t * (ROUTE.length - 1)), ROUTE.length - 2);
  const u = t * (ROUTE.length - 1) - seg;
  const [a, b] = [ROUTE[seg], ROUTE[seg + 1]];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

async function main() {
  const { lot } = await (await fetch(`${API}/api/lots/${lotId}`)).json();
  const [min, max] = [lot.minTemp / 10, lot.maxTemp / 10];
  console.log(`Lot ${lotId.slice(0, 10)}… (${lot.nature}), plage tolérée ${min}–${max} °C`);

  for (let i = 0; i < steps; i++) {
    const [lat, lon] = position(i / (steps - 1));
    const inBreak = breakChain && i >= Math.floor(steps / 2) && i < Math.floor(steps / 2) + 2;
    const temperature = inBreak
      ? max + 4 + Math.random() * 2
      : (min + max) / 2 + (Math.random() - 0.5) * (max - min) * 0.4;

    const r = await (await fetch(`${API}/api/iot/${lotId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account, temperature: +temperature.toFixed(1), lat, lon }),
    })).json();

    if (r.error) { console.error("  ✖", r.error); process.exit(1); }
    const alert = r.anomalies.length ? `  ⚠ ALERTE : ${r.anomalies.join(", ")}` : "";
    console.log(`  #${i + 1} ${temperature.toFixed(1).padStart(5)} °C  (${lat.toFixed(3)}, ${lon.toFixed(3)})  bloc ${r.block}${alert}`);
    await new Promise((s) => setTimeout(s, intervalS * 1000));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
