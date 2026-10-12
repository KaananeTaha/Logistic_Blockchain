// Comptes de démonstration : un compte par profil du canevas.
// ⚠️ Mnémonique PUBLIQUE de Hardhat : uniquement pour un réseau de test, jamais en production.
const { HDNodeWallet } = require("ethers");

const MNEMONIC = process.env.MNEMONIC || "test test test test test test test test test test test junk";

// Index de dérivation -> profil. Le compte 0 déploie le contrat, il devient donc Gestionnaire.
const ROLES = {
  manager: { index: 0, roleId: 3, label: "Gestionnaire (MOA)" },
  supplier: { index: 1, roleId: 1, label: "Fournisseur / Producteur" },
  carrier: { index: 2, roleId: 2, label: "Transporteur / Logisticien" },
  recipient: { index: 3, roleId: 4, label: "Destinataire / Client final" },
};

function walletFor(role) {
  return HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${ROLES[role].index}`);
}

module.exports = { MNEMONIC, ROLES, walletFor };
