// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ISSIRegistry.sol";
import "./CredentialRegistry.sol";
import "./SchemaRegistry.sol";
import "./ConsentRegistry.sol";

/**
 * @title SSI Registry
 * @dev A registry for Self-Sovereign Identity (SSI) credentials and schemas
 * This contract inherits from CredentialRegistry, SchemaRegistry, and ConsentRegistry to provide
 * a complete SSI Registry solution with access control.
 */
contract SSIRegistry is ISSIRegistry, CredentialRegistry, SchemaRegistry, ConsentRegistry {
    // Contract version
    string public constant VERSION = "2.0.0";

    // Contract metadata
    string public name;
    string public description;

    // DID mappings
    // Maps a DID string to the associated EOA address
    mapping(string => address) private didToAddress;

    // Maps a DID string to the IPFS CID of its DID Document
    mapping(string => string) private didToCid;

    // Events for DID registration
    event HolderDIDRegistered(string holderDid, address holder, string didDocCid, uint256 timestamp);
    event IssuerDIDRegistered(string issuerDid, address issuer, string didDocCid, uint256 timestamp);
    event VerifierDIDRegistered(string verifierDid, address verifier, string didDocCid, uint256 timestamp);

    /**
     * @dev Constructor to initialize the contract with a name and description
     * @param _name The name of the registry
     * @param _description A description of the registry
     * @param _trustedForwarder The address of the trusted forwarder for meta-transactions
     */
    constructor(string memory _name, string memory _description, address _trustedForwarder) 
        SphyreAccessControl(_trustedForwarder)
    {
        name = _name;
        description = _description;
    }

    /**
     * @dev Update the registry metadata
     * @param _name The new name of the registry
     * @param _description The new description of the registry
     */
    function updateMetadata(string memory _name, string memory _description) public onlyOwner {
        name = _name;
        description = _description;
    }

    /**
     * @dev Get the contract version
     * @return The contract version
     */
    function getVersion() public pure returns (string memory) {
        return VERSION;
    }

    /**
     * @dev Add a new issuer to the registry
     * @param issuer The address of the issuer to add
     */
    function addIssuer(address issuer) public onlyRole(ADMIN_ROLE) {
        grantRole(ISSUER_ROLE, issuer);
    }

    /**
     * @dev Remove an issuer from the registry
     * @param issuer The address of the issuer to remove
     */
    function removeIssuer(address issuer) public onlyRole(ADMIN_ROLE) {
        revokeRole(ISSUER_ROLE, issuer);
    }

    /**
     * @dev Check if an address is an issuer
     * @param issuer The address to check
     * @return True if the address is an issuer
     */
    function isIssuer(address issuer) public view returns (bool) {
        return hasRole(ISSUER_ROLE, issuer);
    }

    /**
     * @dev Register a new holder DID with HOLDER_ROLE
     * @param holderDid The DID of the holder to register
     * @param holder The EOA address associated with the holder DID
     * @param didDocCid The IPFS CID of the holder's DID Document
     * @return True if registration was successful
     */
    function registerHolderDID(
        string memory holderDid,
        address holder,
        string memory didDocCid
    )
        public
        onlyRole(ADMIN_ROLE)
        returns (bool)
    {
        require(holder != address(0), "Invalid holder address");

        didToAddress[holderDid] = holder;
        didToCid[holderDid] = didDocCid;

        // Grant HOLDER_ROLE to the holder address
        grantRole(HOLDER_ROLE, holder);

        emit HolderDIDRegistered(holderDid, holder, didDocCid, block.timestamp);
        return true;
    }

    /**
     * @dev Register a new issuer DID and grant ISSUER_ROLE
     * @param issuerDid The DID of the issuer to register
     * @param issuer The EOA address associated with the issuer DID
     * @param didDocCid The IPFS CID of the issuer's DID Document
     * @return True if registration was successful
     */
    function registerIssuerDID(
        string memory issuerDid,
        address issuer,
        string memory didDocCid
    )
        public
        onlyRole(ADMIN_ROLE)
        returns (bool)
    {
        require(issuer != address(0), "Invalid issuer address");

        didToAddress[issuerDid] = issuer;
        didToCid[issuerDid] = didDocCid;

        grantRole(ISSUER_ROLE, issuer);

        emit IssuerDIDRegistered(issuerDid, issuer, didDocCid, block.timestamp);
        return true;
    }

    /**
     * @dev Register a new verifier DID and grant VERIFIER_ROLE
     * @param verifierDid The DID of the verifier to register
     * @param verifier The EOA address associated with the verifier DID
     * @param didDocCid The IPFS CID of the verifier's DID Document
     * @return True if registration was successful
     */
    function registerVerifierDID(
        string memory verifierDid,
        address verifier,
        string memory didDocCid
    )
        public
        onlyRole(ADMIN_ROLE)
        returns (bool)
    {
        require(verifier != address(0), "Invalid verifier address");

        didToAddress[verifierDid] = verifier;
        didToCid[verifierDid] = didDocCid;

        grantRole(VERIFIER_ROLE, verifier);

        emit VerifierDIDRegistered(verifierDid, verifier, didDocCid, block.timestamp);
        return true;
    }

    /**
     * @dev Add a new admin to the registry
     * @param admin The address of the admin to add
     */
    function addAdmin(address admin) public onlyRole(ADMIN_ROLE) {
        grantRole(ADMIN_ROLE, admin);
    }

    /**
     * @dev Add a new holder to the registry with HOLDER_ROLE
     * @param holder The address of the holder to add
     */
    function addHolder(address holder) public onlyRole(ADMIN_ROLE) {
        grantRole(HOLDER_ROLE, holder);
    }

    /**
     * @dev Add a new verifier to the registry with VERIFIER_ROLE
     * @param verifier The address of the verifier to add
     */
    function addVerifier(address verifier) public onlyRole(ADMIN_ROLE) {
        grantRole(VERIFIER_ROLE, verifier);
    }

    /**
     * @dev Check if an address is a holder
     * @param holder The address to check
     * @return True if the address is a holder
     */
    function isHolder(address holder) public view returns (bool) {
        return hasRole(HOLDER_ROLE, holder);
    }

    /**
     * @dev Check if an address is a verifier
     * @param verifier The address to check
     * @return True if the address is a verifier
     */
    function isVerifier(address verifier) public view returns (bool) {
        return hasRole(VERIFIER_ROLE, verifier);
    }

    /**
     * @dev Remove an admin from the registry
     * @param admin The address of the admin to remove
     */
    function removeAdmin(address admin) public onlyRole(ADMIN_ROLE) {
        revokeRole(ADMIN_ROLE, admin);
    }

    /**
     * @dev Check if an address is an admin
     * @param admin The address to check
     * @return True if the address is an admin
     */
    function isAdmin(address admin) public view returns (bool) {
        return hasRole(ADMIN_ROLE, admin);
    }

    /**
     * @dev Get DID information (address and DID document CID)
     * @param did The DID to query
     * @return associatedAddress The address associated with the DID
     * @return didDocCid The IPFS CID of the DID Document
     */
    function getDIDInfo(string memory did)
        public
        view
        returns (address associatedAddress, string memory didDocCid)
    {
        associatedAddress = didToAddress[did];
        didDocCid = didToCid[did];
    }

    /**
     * @dev Get the registry metadata
     * @return _name The name of the registry
     * @return _description The description of the registry
     * @return _version The version of the registry
     * @return _owner The owner of the registry
     */
    function getMetadata() public view returns (
        string memory _name,
        string memory _description,
        string memory _version,
        address _owner
    ) {
        return (name, description, VERSION, owner());
    }

    // Override functions to resolve inheritance conflicts
    
    function registerCredential(string memory did, string memory credentialHash) 
        public 
        override(ISSIRegistry, CredentialRegistry) 
        onlyRole(ISSUER_ROLE) 
        returns (bool) 
    {
        return CredentialRegistry.registerCredential(did, credentialHash);
    }

    function revokeCredential(string memory did, string memory credentialHash) 
        public 
        override(ISSIRegistry, CredentialRegistry) 
        onlyRole(ISSUER_ROLE) 
        returns (bool) 
    {
        return CredentialRegistry.revokeCredential(did, credentialHash);
    }

    function isCredentialRegistered(string memory did, string memory credentialHash) 
        public 
        view 
        override(ISSIRegistry, CredentialRegistry) 
        returns (bool) 
    {
        return CredentialRegistry.isCredentialRegistered(did, credentialHash);
    }

    function isCredentialRevoked(string memory did, string memory credentialHash) 
        public 
        view 
        override(ISSIRegistry, CredentialRegistry) 
        returns (bool) 
    {
        return CredentialRegistry.isCredentialRevoked(did, credentialHash);
    }

    function registerSchema(string memory schemaId, string memory schemaHash) 
        public 
        override(ISSIRegistry, SchemaRegistry) 
        onlyRole(ISSUER_ROLE) 
        returns (bool) 
    {
        return SchemaRegistry.registerSchema(schemaId, schemaHash);
    }

    function getSchemaHash(string memory schemaId) 
        public 
        view 
        override(ISSIRegistry, SchemaRegistry) 
        returns (string memory) 
    {
        return SchemaRegistry.getSchemaHash(schemaId);
    }

    function grantConsent(
        string memory userDid,
        string memory verifierDid,
        string memory purpose,
        string memory dataCategories,
        uint8 accessLevel,
        uint256 expiresAt
    ) 
        public 
        override(ISSIRegistry, ConsentRegistry) 
        returns (bool) 
    {
        return ConsentRegistry.grantConsent(userDid, verifierDid, purpose, dataCategories, accessLevel, expiresAt);
    }

    function revokeConsent(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) 
        public 
        override(ISSIRegistry, ConsentRegistry) 
        returns (bool) 
    {
        return ConsentRegistry.revokeConsent(userDid, verifierDid, purpose);
    }

    function isConsentValid(
        string memory userDid,
        string memory verifierDid,
        string memory purpose
    ) 
        public 
        view 
        override(ISSIRegistry, ConsentRegistry) 
        returns (bool) 
    {
        return ConsentRegistry.isConsentValid(userDid, verifierDid, purpose);
    }
}
