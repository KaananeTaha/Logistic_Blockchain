const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const Role = { Supplier: 1, Carrier: 2, Manager: 3, Recipient: 4 };
const Status = { Created: 0, PickedUp: 1, InCustoms: 2, InStorage: 3, InTransit: 4, Delivered: 5, Disputed: 6 };

describe("LogisticsTraceability", () => {
  let c, manager, supplier, carrier, recipient, other, lotId;

  beforeEach(async () => {
    [manager, supplier, carrier, recipient, other] = await ethers.getSigners();
    c = await (await ethers.getContractFactory("LogisticsTraceability")).deploy();
    await c.grantRole(supplier.address, Role.Supplier);
    await c.grantRole(carrier.address, Role.Carrier);
    await c.grantRole(recipient.address, Role.Recipient);

    const now = await time.latest();
    const tx = await c.connect(supplier).createLot(
      "Vaccins", 100, now, 20, 80, now + 3 * 24 * 3600, recipient.address, ethers.id("donnees-privees"));
    const rc = await tx.wait();
    lotId = rc.logs.map((l) => c.interface.parseLog(l)).find((e) => e?.name === "LotCreated").args.lotId;
  });

  describe("contrôle d'accès (Fct8)", () => {
    it("refuse la création de lot à un non-fournisseur", async () => {
      const now = await time.latest();
      await expect(c.connect(carrier).createLot("x", 1, now, 0, 1, now + 10, recipient.address, ethers.ZeroHash))
        .to.be.revertedWith("Role non autorise");
    });

    it("seul le gestionnaire attribue des rôles", async () => {
      await expect(c.connect(supplier).grantRole(other.address, Role.Manager))
        .to.be.revertedWith("Role non autorise");
    });

    it("refuse un destinataire qui n'a pas le rôle Destinataire", async () => {
      const now = await time.latest();
      await expect(c.connect(supplier).createLot("x", 1, now, 0, 1, now + 100, other.address, ethers.ZeroHash))
        .to.be.revertedWith("Destinataire invalide");
    });
  });

  describe("création (Fct1)", () => {
    it("enregistre le lot, son hash et l'événement initial", async () => {
      const lot = await c.getLot(lotId);
      expect(lot.dataHash).to.equal(ethers.id("donnees-privees"));
      expect(lot.status).to.equal(Status.Created);
      expect((await c.getHistory(lotId)).length).to.equal(1);
      expect(await c.getLotIds()).to.deep.equal([lotId]);
    });

    it("génère des identifiants différents pour deux lots identiques", async () => {
      const now = await time.latest();
      const args = ["Vaccins", 100, now, 20, 80, now + 3600, recipient.address, ethers.id("donnees-privees")];
      await c.connect(supplier).createLot(...args);
      const ids = await c.getLotIds();
      expect(ids[0]).to.not.equal(ids[1]);
    });
  });

  describe("règles automatiques (Fct4)", () => {
    it("déclenche une alerte unique si la température sort des seuils", async () => {
      await expect(c.connect(carrier).recordSensorData(lotId, 150, 0, 0)).to.emit(c, "AnomalyRaised");
      await expect(c.connect(carrier).recordSensorData(lotId, 160, 0, 0)).to.not.emit(c, "AnomalyRaised");
      expect((await c.getLot(lotId)).coldChainBreach).to.equal(true);
    });

    it("n'alerte pas si la température est dans la plage", async () => {
      await expect(c.connect(carrier).recordSensorData(lotId, 50, 0, 0)).to.not.emit(c, "AnomalyRaised");
    });

    it("déclenche une alerte si le délai est dépassé", async () => {
      await time.increase(4 * 24 * 3600);
      await expect(c.connect(carrier).updateStatus(lotId, Status.InTransit, ethers.ZeroHash))
        .to.emit(c, "AnomalyRaised");
      expect((await c.getLot(lotId)).late).to.equal(true);
    });

    it("le gestionnaire peut modifier les seuils", async () => {
      await c.setRules(lotId, -200, -150, (await time.latest()) + 3600);
      await expect(c.connect(carrier).recordSensorData(lotId, 50, 0, 0)).to.emit(c, "AnomalyRaised");
    });
  });

  describe("transport et livraison (Fct2, Fct6)", () => {
    it("clôture la livraison et garde l'historique complet", async () => {
      await c.connect(carrier).updateStatus(lotId, Status.PickedUp, ethers.ZeroHash);
      await c.connect(recipient).confirmDelivery(lotId);
      const h = await c.getHistory(lotId);
      expect(h.map((e) => Number(e.status))).to.deep.equal([Status.Created, Status.PickedUp, Status.Delivered]);
    });

    it("le transporteur ne peut pas se déclarer livré", async () => {
      await expect(c.connect(carrier).updateStatus(lotId, Status.Delivered, ethers.ZeroHash))
        .to.be.revertedWith("Statut interdit");
    });

    it("plus aucune écriture après clôture", async () => {
      await c.connect(recipient).confirmDelivery(lotId);
      await expect(c.connect(carrier).recordSensorData(lotId, 50, 0, 0)).to.be.revertedWith("Lot cloture");
    });

    it("le destinataire peut ouvrir un litige", async () => {
      await expect(c.connect(recipient).raiseDispute(lotId, ethers.id("colis abime")))
        .to.emit(c, "DisputeRaised");
      expect((await c.getLot(lotId)).status).to.equal(Status.Disputed);
    });
  });
});
