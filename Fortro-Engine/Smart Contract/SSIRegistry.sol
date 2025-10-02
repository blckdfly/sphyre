// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ConsentRegistry.sol";
import "./CredentialRegistry.sol";
import "./DIDRegistry.sol";
import "./ISSIRegistry.sol";
import "./SchemaRegistry.sol";

/**
 * @title SSI Registry
 * @dev A registry for Self-Sovereign Identity (SSI) credentials and schemas
 * This contract inherits from CredentialRegistry, SchemaRegistry, and ConsentRegistry to provide
 * a complete SSI Registry solution with access control.
 */
contract SSIRegistry is CredentialRegistry, SchemaRegistry, ConsentRegistry {
    string public constant VERSION = "2.0.0";
    string public name;
    string public description;

    DIDRegistry public didRegistry;

    constructor(
        string memory _name,
        string memory _description,
        address _didRegistry
    ) {
        name = _name;
        description = _description;
        didRegistry = DIDRegistry(_didRegistry);
    }

    // Convenience functions for role management
    function addIssuer(address issuer) public onlyRole(VERIFIER_ROLE) {
        grantRole(ISSUER_ROLE, issuer);
    }

    function removeIssuer(address issuer) public onlyRole(VERIFIER_ROLE) {
        revokeRole(ISSUER_ROLE, issuer);
    }

    function isIssuer(address issuer) public view returns (bool) {
        return hasRole(ISSUER_ROLE, issuer);
    }

    function addVerifier(address verifier) public onlyRole(VERIFIER_ROLE) {
        grantRole(VERIFIER_ROLE, verifier);
    }

    function removeVerifier(address verifier) public onlyRole(VERIFIER_ROLE) {
        revokeRole(VERIFIER_ROLE, verifier);
    }

    function isVerifier(address verifier) public view returns (bool) {
        return hasRole(VERIFIER_ROLE, verifier);
    }

    function updateMetadata(string memory _name, string memory _description)
    public onlyOwner {
        name = _name;
        description = _description;
    }

    function getVersion() public pure returns (string memory) {
        return VERSION;
    }

    function getMetadata() public view returns (
        string memory _name,
        string memory _description,
        string memory _version,
        address _owner,
        address _didRegistry
    ) {
        return (name, description, VERSION, owner(), address(didRegistry));
    }
}
