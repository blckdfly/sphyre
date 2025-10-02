// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SSIRegistry.sol";

contract SSIRegistryFactory {
    event RegistryCreated(
        address indexed registry,
        string name,
        string description,
        address indexed owner,
        address indexed didRegistry
    );

    address[] private _registries;
    DIDRegistry public immutable didRegistry;

    constructor() {
        // Deploy a shared DID registry
        didRegistry = new DIDRegistry();
    }

    function createRegistry(string memory name, string memory description)
    public returns (address) {
        SSIRegistry registry = new SSIRegistry(name, description, address(didRegistry));
        registry.transferOwnership(msg.sender);

        _registries.push(address(registry));

        emit RegistryCreated(
            address(registry),
            name,
            description,
            msg.sender,
            address(didRegistry)
        );

        return address(registry);
    }

    function getRegistryCount() public view returns (uint256) {
        return _registries.length;
    }

    function getRegistryByIndex(uint256 index) public view returns (address) {
        require(index < _registries.length, "Index out of bounds");
        return _registries[index];
    }

    function getAllRegistries() public view returns (address[] memory) {
        return _registries;
    }

    function getDIDRegistry() public view returns (address) {
        return address(didRegistry);
    }
}
