// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";
contract SchemaRegistry is AccessControl {
    struct Schema {
        string schemaURI; // IPFS URI for schema content
        bool isRegistered;
        uint256 registeredAt;
        uint256 updatedAt;
        address registeredBy;
        address updatedBy;
        uint256 version;
    }

    mapping(string => Schema) private _schemas;
    string[] private _schemaIds;

    event SchemaRegistered(
        string indexed schemaId,
        string schemaURI,
        address indexed registeredBy,
        uint256 timestamp
    );

    event SchemaUpdated(
        string indexed schemaId,
        string schemaURI,
        address indexed updatedBy,
        uint256 timestamp,
        uint256 version
    );

    function registerSchema(string memory schemaId, string memory schemaURI)
    public onlyRole(ISSUER_ROLE) returns (bool) {
        require(bytes(schemaId).length > 0, "Empty schema ID");
        require(bytes(schemaURI).length > 0, "Empty schema URI");

        if (_schemas[schemaId].isRegistered) {
            return _updateSchema(schemaId, schemaURI);
        }

        _schemas[schemaId] = Schema({
            schemaURI: schemaURI,
            isRegistered: true,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp,
            registeredBy: msg.sender,
            updatedBy: msg.sender,
            version: 1
        });

        _schemaIds.push(schemaId);

        emit SchemaRegistered(schemaId, schemaURI, msg.sender, block.timestamp);
        return true;
    }

    function _updateSchema(string memory schemaId, string memory schemaURI)
    private returns (bool) {
        require(
            _schemas[schemaId].registeredBy == msg.sender ||
            hasRole(VERIFIER_ROLE, msg.sender),
            "Unauthorized"
        );

        _schemas[schemaId].schemaURI = schemaURI;
        _schemas[schemaId].updatedAt = block.timestamp;
        _schemas[schemaId].updatedBy = msg.sender;
        _schemas[schemaId].version += 1;

        emit SchemaUpdated(
            schemaId,
            schemaURI,
            msg.sender,
            block.timestamp,
            _schemas[schemaId].version
        );

        return true;
    }

    function getSchemaURI(string memory schemaId) public view returns (string memory) {
        require(_schemas[schemaId].isRegistered, "Schema not found");
        return _schemas[schemaId].schemaURI;
    }

    function isSchemaRegistered(string memory schemaId) public view returns (bool) {
        return _schemas[schemaId].isRegistered;
    }

    function getSchemaCount() public view returns (uint256) {
        return _schemaIds.length;
    }

    function getSchemaIdByIndex(uint256 index) public view returns (string memory) {
        require(index < _schemaIds.length, "Index out of bounds");
        return _schemaIds[index];
    }
}
