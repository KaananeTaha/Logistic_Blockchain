const { expect } = require("chai");
const { qbftExtraData, genesis } = require("../backend/src/besu");

describe("Genesis du réseau Besu (QBFT)", () => {
  // Exemple officiel de la documentation Besu (tutoriel QBFT, « Generate extra data »).
  it("encode extraData exactement comme `besu rlp encode --type=QBFT_EXTRA_DATA`", () => {
    const validators = [
      "0x4592c8e45706cc08b8f44b11e43cba0cfc5892cb",
      "0x06e23768a0f59cf365e18c2e0c89e151bcdedc70",
      "0xc5327f96ee02d7bcbc1bf1236b8c15148971e1de",
      "0xab5e7f4061c605820d3744227eed91ff8e2c8908",
    ];
    expect(qbftExtraData(validators)).to.equal(
      "0xf87aa00000000000000000000000000000000000000000000000000000000000000000f854944592c8e45706cc08b8f44b11e43cba0cfc5892cb9406e23768a0f59cf365e18c2e0c89e151bcdedc7094c5327f96ee02d7bcbc1bf1236b8c15148971e1de94ab5e7f4061c605820d3744227eed91ff8e2c8908c080c0");
  });

  it("démarre avec le seul validateur fondateur, sur la chaîne 1337, en QBFT", () => {
    const g = genesis(["0x4592C8E45706cc08b8f44b11e43cba0cfc5892cb"]);
    expect(g.config.chainId).to.equal(1337);
    expect(g.config.qbft.blockperiodseconds).to.equal(2);
    expect(g.extraData).to.equal(qbftExtraData(["0x4592c8e45706cc08b8f44b11e43cba0cfc5892cb"]));
  });
});
