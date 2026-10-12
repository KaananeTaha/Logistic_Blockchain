// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LogisticsTraceability
/// @notice Registre immuable des lots et événements logistiques (PRJINFO-18).
///         Seuls des hashs des données privées sont stockés on-chain (confidentialité).
contract LogisticsTraceability {
    // ───────────── Profils (feuille « Profil » du canevas) ─────────────
    enum Role { None, Supplier, Carrier, Manager, Recipient }

    // ───────────── Cycle de vie d'un lot ─────────────
    enum Status { Created, PickedUp, InCustoms, InStorage, InTransit, Delivered, Disputed }

    struct Lot {
        bytes32 id;              // identifiant unique = contenu du QR Code
        bytes32 dataHash;        // hash des données privées stockées off-chain
        string nature;
        uint32 quantity;
        uint64 manufactureDate;
        int16 minTemp;           // dixièmes de °C (ex: 20 = 2,0 °C)
        int16 maxTemp;
        uint64 deadline;         // date limite de livraison (timestamp)
        address supplier;
        address recipient;
        Status status;
        bool coldChainBreach;    // positionnés par les règles automatiques (Fct4)
        bool late;
        uint64 createdAt;
    }

    struct TraceEvent {
        Status status;
        address actor;
        uint64 timestamp;
        bytes32 noteHash;        // hash d'un détail off-chain (lieu, douane...)
    }

    mapping(address => Role) public roles;
    mapping(bytes32 => Lot) private lots;
    mapping(bytes32 => TraceEvent[]) private history;
    mapping(address => uint256) private nonces;
    bytes32[] private lotIds;

    // ───────────── Événements (lus par le backend / dashboard) ─────────────
    event RoleGranted(address indexed account, Role role);
    event LotCreated(bytes32 indexed lotId, address indexed supplier, address indexed recipient);
    event StatusUpdated(bytes32 indexed lotId, Status status, address actor);
    event SensorReading(bytes32 indexed lotId, int16 temperature, int32 lat, int32 lon, uint64 timestamp);
    event AnomalyRaised(bytes32 indexed lotId, string reason, uint64 timestamp);
    event RulesUpdated(bytes32 indexed lotId, int16 minTemp, int16 maxTemp, uint64 deadline);
    event DeliveryConfirmed(bytes32 indexed lotId, address indexed recipient, uint64 timestamp);
    event DisputeRaised(bytes32 indexed lotId, address indexed by, bytes32 reasonHash);

    modifier onlyRole(Role r) {
        require(roles[msg.sender] == r, "Role non autorise");
        _;
    }

    modifier lotExists(bytes32 id) {
        require(lots[id].supplier != address(0), "Lot inconnu");
        _;
    }

    modifier notClosed(bytes32 id) {
        Status s = lots[id].status;
        require(s != Status.Delivered && s != Status.Disputed, "Lot cloture");
        _;
    }

    constructor() {
        roles[msg.sender] = Role.Manager; // le déployeur = Gestionnaire (MOA)
        emit RoleGranted(msg.sender, Role.Manager);
    }

    // ───────────── Fct8 : gestion des accès et paramétrage ─────────────
    function grantRole(address account, Role role) external onlyRole(Role.Manager) {
        roles[account] = role;
        emit RoleGranted(account, role);
    }

    function setRules(bytes32 id, int16 minTemp, int16 maxTemp, uint64 deadline)
        external onlyRole(Role.Manager) lotExists(id) notClosed(id)
    {
        require(minTemp <= maxTemp, "Seuils invalides");
        Lot storage l = lots[id];
        (l.minTemp, l.maxTemp, l.deadline) = (minTemp, maxTemp, deadline);
        emit RulesUpdated(id, minTemp, maxTemp, deadline);
    }

    // ───────────── Fct1 : création & enregistrement du lot ─────────────
    function createLot(
        string calldata nature,
        uint32 quantity,
        uint64 manufactureDate,
        int16 minTemp,
        int16 maxTemp,
        uint64 deadline,
        address recipient,
        bytes32 dataHash
    ) external onlyRole(Role.Supplier) returns (bytes32 id) {
        require(roles[recipient] == Role.Recipient, "Destinataire invalide");
        require(minTemp <= maxTemp, "Seuils invalides");
        require(deadline > block.timestamp, "Date limite passee");

        id = keccak256(abi.encode(msg.sender, nonces[msg.sender]++, dataHash));
        Lot storage l = lots[id];
        l.id = id;
        l.dataHash = dataHash;
        l.nature = nature;
        l.quantity = quantity;
        l.manufactureDate = manufactureDate;
        l.minTemp = minTemp;
        l.maxTemp = maxTemp;
        l.deadline = deadline;
        l.supplier = msg.sender;
        l.recipient = recipient;
        l.createdAt = uint64(block.timestamp);
        lotIds.push(id);
        history[id].push(TraceEvent(Status.Created, msg.sender, uint64(block.timestamp), 0));

        emit LotCreated(id, msg.sender, recipient);
    }

    // ───────────── Fct2 : mise à jour du statut de transit ─────────────
    function updateStatus(bytes32 id, Status status, bytes32 noteHash)
        external onlyRole(Role.Carrier) lotExists(id) notClosed(id)
    {
        require(status >= Status.PickedUp && status <= Status.InTransit, "Statut interdit");

        lots[id].status = status;
        history[id].push(TraceEvent(status, msg.sender, uint64(block.timestamp), noteHash));
        emit StatusUpdated(id, status, msg.sender);
        _checkDeadline(id);
    }

    // ───────────── Fct3 + Fct4 : données IoT + validation automatique ─────────────
    function recordSensorData(bytes32 id, int16 temperature, int32 lat, int32 lon)
        external onlyRole(Role.Carrier) lotExists(id) notClosed(id)
    {
        Lot storage l = lots[id];
        emit SensorReading(id, temperature, lat, lon, uint64(block.timestamp));

        if (!l.coldChainBreach && (temperature < l.minTemp || temperature > l.maxTemp)) {
            l.coldChainBreach = true;
            emit AnomalyRaised(id, "Rupture de la chaine du froid", uint64(block.timestamp));
        }
        _checkDeadline(id);
    }

    /// @notice Les règles ne s'exécutent qu'à l'occasion d'une transaction :
    ///         n'importe qui peut forcer la vérification du délai.
    function checkDeadline(bytes32 id) external lotExists(id) notClosed(id) {
        _checkDeadline(id);
    }

    function _checkDeadline(bytes32 id) internal {
        Lot storage l = lots[id];
        if (!l.late && block.timestamp > l.deadline) {
            l.late = true;
            emit AnomalyRaised(id, "Delai de livraison depasse", uint64(block.timestamp));
        }
    }

    // ───────────── Fct6 : validation de la livraison ─────────────
    function confirmDelivery(bytes32 id) external onlyRole(Role.Recipient) lotExists(id) notClosed(id) {
        require(lots[id].recipient == msg.sender, "Pas le destinataire");
        _checkDeadline(id);
        lots[id].status = Status.Delivered;
        history[id].push(TraceEvent(Status.Delivered, msg.sender, uint64(block.timestamp), 0));
        emit DeliveryConfirmed(id, msg.sender, uint64(block.timestamp));
    }

    /// @notice Le destinataire refuse la livraison (litige à résoudre par le Gestionnaire).
    function raiseDispute(bytes32 id, bytes32 reasonHash)
        external onlyRole(Role.Recipient) lotExists(id) notClosed(id)
    {
        require(lots[id].recipient == msg.sender, "Pas le destinataire");
        lots[id].status = Status.Disputed;
        history[id].push(TraceEvent(Status.Disputed, msg.sender, uint64(block.timestamp), reasonHash));
        emit DisputeRaised(id, msg.sender, reasonHash);
    }

    // ───────────── Fct5 : consultation & traçabilité (lecture publique) ─────────────
    function getLot(bytes32 id) external view lotExists(id) returns (Lot memory) {
        return lots[id];
    }

    function getHistory(bytes32 id) external view lotExists(id) returns (TraceEvent[] memory) {
        return history[id];
    }

    function getLotIds() external view returns (bytes32[] memory) {
        return lotIds;
    }
}
