// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TestOnly} from "./TestOnly.sol";

/// Minimal ERC20 used as the base of every test token. mint() is public on purpose.
contract Base20 is TestOnly {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) internal _bal;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function balanceOf(address a) public view virtual returns (uint256) {
        return _bal[a];
    }

    function mint(address to, uint256 v) public virtual {
        totalSupply += v;
        _bal[to] += v;
        emit Transfer(address(0), to, v);
    }

    function approve(address spender, uint256 v) public virtual returns (bool) {
        allowance[msg.sender][spender] = v;
        emit Approval(msg.sender, spender, v);
        return true;
    }

    function transfer(address to, uint256 v) public virtual returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    /// Like USDT-style tokens, a zero-value transferFrom needs no allowance. That is what
    /// makes zero-value address poisoning possible (vector D21).
    function transferFrom(address from, address to, uint256 v) public virtual returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= v, "allowance");
            allowance[from][msg.sender] = a - v;
        }
        _move(from, to, v);
        return true;
    }

    function _move(address from, address to, uint256 v) internal virtual {
        require(_bal[from] >= v, "balance");
        _bal[from] -= v;
        _bal[to] += v;
        emit Transfer(from, to, v);
    }
}
