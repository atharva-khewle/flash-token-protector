// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// Every contract in this folder inherits this. The constructor reverts on any
/// chain except a local Anvil node (31337) or BSC testnet (97), so none of
/// these tokens can ever be deployed to a mainnet by mistake.
abstract contract TestOnly {
    constructor() {
        require(block.chainid == 31337 || block.chainid == 97, "TEST ONLY: refusing to deploy on this chain");
    }
}
