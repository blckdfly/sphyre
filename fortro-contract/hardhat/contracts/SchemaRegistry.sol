// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccessControl.sol";

/**
 * @title SchemaRegistry
 * @dev Contract for managing Self-Sovereign Identity (SSI) schemas
 */
abstract contract SchemaRegistry is SphyreAccessControl {
    // Schema structure
    struct Schema {
        string schemaHash;
        bool isRegistered;
        uint256 registeredAt;
        uint256 updatedAt;
        address registeredBy;
        address updatedBy;
        uint256 version;
    }
    
    // Mapping from schema ID to schema data
    mapping(string => Schema) private _schemas;
    
    // Array to store all schema IDs
    string[] private _schemaIds;
    
    // Events
    event SchemaRegistered(string indexed schemaId, string schemaHash, address indexed registeredBy, uint256 timestamp);
    event SchemaUpdated(string indexed schemaId, string schemaHash, address indexed updatedBy, uint256 timestamp, uint256 version);
    
    /**
     * @dev Register a schema in the registry
     * @param schemaId The ID of the schema
     * @param schemaHash The hash of the schema
     * @return success True if the operation was successful
     */
    function registerSchema(string memory schemaId, string memory schemaHash) public virtual onlyRole(ISSUER_ROLE) returns (bool) {
        require(bytes(schemaId).length > 0, "SchemaRegistry: Schema ID cannot be empty");
        require(bytes(schemaHash).length > 0, "SchemaRegistry: Schema hash cannot be empty");
        
        // Check if the schema is already registered
        if (_schemas[schemaId].isRegistered) {
            // Update the existing schema
            return _updateSchema(schemaId, schemaHash);
        }
        
        // Register the new schema
        _schemas[schemaId] = Schema({
            schemaHash: schemaHash,
            isRegistered: true,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp,
            registeredBy: _msgSender(),
            updatedBy: _msgSender(),
            version: 1
        });
        
        // Add the schema ID to the array
        _schemaIds.push(schemaId);
        
        emit SchemaRegistered(schemaId, schemaHash, _msgSender(), block.timestamp);
        return true;
    }
    
    /**
     * @dev Update an existing schema
     * @param schemaId The ID of the schema
     * @param schemaHash The new hash of the schema
     * @return success True if the operation was successful
     */
    function _updateSchema(string memory schemaId, string memory schemaHash) private returns (bool) {
        // Check if the caller is the issuer who registered the schema or an admin
        require(
            _schemas[schemaId].registeredBy == _msgSender() || hasRole(ADMIN_ROLE, _msgSender()),
            "SchemaRegistry: Only the issuer or an admin can update the schema"
        );
        
        // Update the schema
        _schemas[schemaId].schemaHash = schemaHash;
        _schemas[schemaId].updatedAt = block.timestamp;
        _schemas[schemaId].updatedBy = _msgSender();
        _schemas[schemaId].version += 1;
        
        emit SchemaUpdated(
            schemaId,
            schemaHash,
            _msgSender(),
            block.timestamp,
            _schemas[schemaId].version
        );
        
        return true;
    }
    
    /**
     * @dev Get the hash of a schema
     * @param schemaId The ID of the schema
     * @return schemaHash The hash of the schema
     */
    function getSchemaHash(string memory schemaId) public view virtual returns (string memory) {
        require(_schemas[schemaId].isRegistered, "SchemaRegistry: Schema not registered");
        return _schemas[schemaId].schemaHash;
    }
    
    /**
     * @dev Get detailed information about a schema
     * @param schemaId The ID of the schema
     * @return schemaHash The hash of the schema
     * @return isRegistered True if the schema is registered
     * @return registeredAt Timestamp when the schema was registered
     * @return updatedAt Timestamp when the schema was last updated
     * @return registeredBy Address that registered the schema
     * @return updatedBy Address that last updated the schema
     * @return version The version of the schema
     */
    function getSchemaInfo(string memory schemaId) public view returns (
        string memory schemaHash,
        bool isRegistered,
        uint256 registeredAt,
        uint256 updatedAt,
        address registeredBy,
        address updatedBy,
        uint256 version
    ) {
        Schema memory schema = _schemas[schemaId];
        
        return (
            schema.schemaHash,
            schema.isRegistered,
            schema.registeredAt,
            schema.updatedAt,
            schema.registeredBy,
            schema.updatedBy,
            schema.version
        );
    }
    
    /**
     * @dev Check if a schema is registered
     * @param schemaId The ID of the schema
     * @return isRegistered True if the schema is registered
     */
    function isSchemaRegistered(string memory schemaId) public view returns (bool) {
        return _schemas[schemaId].isRegistered;
    }
    
    /**
     * @dev Get the number of registered schemas
     * @return count The number of registered schemas
     */
    function getSchemaCount() public view returns (uint256) {
        return _schemaIds.length;
    }
    
    /**
     * @dev Get a schema ID by index
     * @param index The index of the schema
     * @return schemaId The ID of the schema
     */
    function getSchemaIdByIndex(uint256 index) public view returns (string memory) {
        require(index < _schemaIds.length, "SchemaRegistry: Index out of bounds");
        return _schemaIds[index];
    }
}