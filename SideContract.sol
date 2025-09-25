// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SideContract is Ownable {
    address public tiffy;

    constructor(address _tiffy) Ownable(msg.sender) {
        tiffy = _tiffy;
    }

    function feedPool(uint256 amount) external {
        // Transfer TIFFY to pair (0x1305302e...)
        (bool success,) = tiffy.call(
            abi.encodeWithSignature("transfer(address,uint256)", 0x1305302e..., amount)
        );
        require(success, "TIFFY transfer failed");
    }

    function setExempt(address[] memory wallets, bool exempt) external onlyOwner {
        // Logic to set fee exemptions in TIFFY contract
        (bool success,) = tiffy.call(
            abi.encodeWithSignature("setFeeExempt(address[],bool)", wallets, exempt)
        );
        require(success, "Exemption failed");
    }
}
