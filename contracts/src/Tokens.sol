// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base20} from "./Base20.sol";
import {TestOnly} from "./TestOnly.sol";

/// Stand-in for the canonical USDT on the local test chain (18 decimals, like BSC-USD).
/// The app registers this address as "canonical" only in the `testnet` build mode.
contract MockUSDT is Base20 {
    constructor() Base20("Tether USD", "USDT", 18) {}
}

/// Generic token with a free mint. Used for: fake "Tether USD" (A1), homoglyph names (A2),
/// a link in the name (A7), wrong decimals (A6), and a bridged lookalike (A4).
contract TestToken is Base20 {
    constructor(string memory n, string memory s, uint8 d) Base20(n, s, d) {}
}

/// B9: shows a balance, but only the owner can move tokens.
contract Honeypot is Base20 {
    address public owner;

    constructor() Base20("Tether USD", "USDT", 18) {
        owner = msg.sender;
    }

    function _move(address from, address to, uint256 v) internal override {
        require(from == owner || msg.sender == owner, "transfers disabled");
        super._move(from, to, v);
    }
}

/// B8: the owner can burn anyone's balance, pause, blacklist, and balances expire.
contract KitchenSink is Base20 {
    address public owner;
    bool public paused;
    mapping(address => bool) public blacklisted;
    mapping(address => uint256) public expiry;

    constructor() Base20("Tether USD", "USDT", 18) {
        owner = msg.sender;
    }

    function mint(address to, uint256 v) public override {
        expiry[to] = block.timestamp + 1 hours;
        super.mint(to, v);
    }

    /// Balance silently becomes zero after the expiry time.
    function balanceOf(address a) public view override returns (uint256) {
        if (expiry[a] != 0 && block.timestamp > expiry[a]) return 0;
        return _bal[a];
    }

    function burn(address from, uint256 v) external {
        require(msg.sender == owner, "owner");
        _bal[from] -= v;
        totalSupply -= v;
        emit Transfer(from, address(0), v);
    }

    function pause() external {
        require(msg.sender == owner, "owner");
        paused = true;
    }

    function addBlackList(address a) external {
        require(msg.sender == owner, "owner");
        blacklisted[a] = true;
    }

    function _move(address from, address to, uint256 v) internal override {
        require(!paused && !blacklisted[from], "blocked");
        expiry[to] = block.timestamp + 1 hours;
        super._move(from, to, v);
    }
}

/// B11: balanceOf returns a huge number for everyone; transfers emit events but move nothing.
contract Liar is TestOnly {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public decimals = 18;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function balanceOf(address) external pure returns (uint256) {
        return 1_000_000 ether;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        emit Transfer(msg.sender, to, v);
        return true;
    }
}

/// B12: takes a 5% fee but the Transfer event reports the gross amount.
contract FeeToken is Base20 {
    constructor() Base20("Tether USD", "USDT", 18) {}

    function _move(address from, address to, uint256 v) internal override {
        require(_bal[from] >= v, "balance");
        _bal[from] -= v;
        _bal[to] += (v * 95) / 100;
        emit Transfer(from, to, v);
    }
}

/// C13: emits a Transfer event for any from/to/value. It holds no balances at all.
contract Forger is TestOnly {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public decimals = 18;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function emitTransfer(address from, address to, uint256 v) external {
        emit Transfer(from, to, v);
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

/// Runs several calls in one transaction. Used to build the mixed tx (C14), the
/// in-and-out tx (C19), and a payment routed through a contract (C37).
contract Batcher is TestOnly {
    function execute(address[] calldata targets, bytes[] calldata datas) external {
        require(targets.length == datas.length, "len");
        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok, bytes memory ret) = targets[i].call(datas[i]);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}

/// B10: EIP-1967 proxy in front of a token implementation.
contract Proxy1967 is TestOnly {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 internal constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address impl, bytes memory initData) {
        assembly {
            sstore(IMPL_SLOT, impl)
        }
        (bool ok,) = impl.delegatecall(initData);
        require(ok, "init");
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPL_SLOT)
            calldatacopy(0, 0, calldatasize())
            let r := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch r
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

/// Token logic behind the proxy.
contract UpgradeableToken is TestOnly {
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function initialize(string memory n, string memory s) external {
        require(bytes(name).length == 0, "init");
        name = n;
        symbol = s;
        decimals = 18;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        emit Transfer(address(0), to, v);
    }
}

/// E25: harmless stand-in for a 7702 delegation target. It exists so the scanner has a
/// delegated account to find. It cannot move funds.
contract TestDelegate is TestOnly {
    event Ping(address indexed who);

    function ping() external {
        emit Ping(msg.sender);
    }

    receive() external payable {}
}
