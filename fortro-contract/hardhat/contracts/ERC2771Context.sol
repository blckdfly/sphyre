// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ERC2771Context
 * @dev Context variant with ERC2771 support (meta-transactions)
 * Allows contracts to accept transactions from a trusted forwarder
 */
abstract contract ERC2771Context {
    address private _trustedForwarder;

    event TrustedForwarderSet(address indexed forwarder);

    /**
     * @dev Initializes the contract with a trusted forwarder
     */
    constructor(address trustedForwarder_) {
        _setTrustedForwarder(trustedForwarder_);
    }

    /**
     * @dev Returns the trusted forwarder address
     */
    function trustedForwarder() public view virtual returns (address) {
        return _trustedForwarder;
    }

    /**
     * @dev Checks if an address is the trusted forwarder
     */
    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return forwarder == _trustedForwarder;
    }

    /**
     * @dev Sets the trusted forwarder address (internal)
     */
    function _setTrustedForwarder(address forwarder) internal {
        _trustedForwarder = forwarder;
        emit TrustedForwarderSet(forwarder);
    }

    /**
     * @dev Returns the sender of the transaction, accounting for meta-transactions
     * If the call came through our trusted forwarder, return the original sender
     * Otherwise, return msg.sender
     */
    function _msgSender() internal view virtual returns (address sender) {
        if (isTrustedForwarder(msg.sender)) {
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            /// @solidity memory-safe-assembly
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return msg.sender;
        }
    }

    /**
     * @dev Returns msg.data, accounting for meta-transactions
     * If the call came through our trusted forwarder, remove the sender address from the end
     * Otherwise, return msg.data as-is
     */
    function _msgData() internal view virtual returns (bytes calldata) {
        if (isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length - 20];
        } else {
            return msg.data;
        }
    }

    /**
     * @dev Returns the amount of gas forwarded to the function
     */
    function _msgGas() internal view virtual returns (uint256) {
        return gasleft();
    }
}
