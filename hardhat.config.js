require("@nomicfoundation/hardhat-toolbox");

// Hardhat ne sert plus qu'à compiler et tester le contrat. Le réseau, lui, est géré par l'application.
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // "paris" : Besu (genesis sans Shanghai) ne supporte pas l'opcode PUSH0 de Solidity >= 0.8.20 par défaut.
  solidity: { version: "0.8.24", settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 } } },
};
