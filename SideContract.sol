// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SideContract is Ownable {
    address public tiffy;
    address public wbnb = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public router = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public pool = 0x1305302e...; // Replace with your TIFFY/WBNB pair address

    constructor(address _tiffy) Ownable(msg.sender) {
        tiffy = _tiffy;
    }

    function feedPool(uint256 amount) external {
        (bool success,) = tiffy.call(
            abi.encodeWithSignature("transfer(address,uint256)", pool, amount)
        );
        require(success, "TIFFY transfer failed");
    }

    function addLiquidity(uint256 tiffyAmount, uint256 wbnbAmount) external {
        (bool success1,) = tiffy.call(
            abi.encodeWithSignature("approve(address,uint256)", router, tiffyAmount)
        );
        require(success1, "TIFFY approve failed");
        (bool success2,) = wbnb.call(
            abi.encodeWithSignature("approve(address,uint256)", router, wbnbAmount)
        );
        require(success2, "WBNB approve failed");
        (bool success3,) = router.call(
            abi.encodeWithSignature(
                "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
                tiffy,
                wbnb,
                tiffyAmount,
                wbnbAmount,
                tiffyAmount * 95 / 100,
                wbnbAmount * 95 / 100,
                msg.sender,
                block.timestamp + 300
            )
        );
        require(success3, "Liquidity add failed");
    }

    function setExempt(address[] memory wallets, bool exempt) external onlyOwner {
        (bool success,) = tiffy.call(
            abi.encodeWithSignature("setFeeExempt(address[],bool)", wallets, exempt)
        );
        require(success, "Exemption failed");
    }
}
