require("@nomicfoundation/hardhat-toolbox");
const { MNEMONIC } = require("./config/demo-accounts");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // "paris" : Besu (genesis sans Shanghai) ne supporte pas l'opcode PUSH0 de Solidity >= 0.8.20 par défaut.
  solidity: { version: "0.8.24", settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 } } },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    // Réseau privé Besu à 4 noeuds (voir network/README.md). Gaz gratuit : les comptes n'ont pas besoin de fonds.
    besu: {
      url: process.env.BESU_RPC || "http://127.0.0.1:8545",
      chainId: 1337,
      gasPrice: 0,
      accounts: { mnemonic: MNEMONIC },
    },
  },
};
