// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPancakeRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
}

interface ITiffy {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function setFeeExempt(address[] memory wallets, bool exempt) external;
}

contract SideLiquidityFeeder is Ownable {
    ITiffy public immutable tiffy;
    IERC20 public immutable wbnb;
    IPancakeRouter public immutable router;
    address public immutable pool;

    constructor(address _tiffy, address _wbnb, address _router, address _pool) Ownable(msg.sender) {
        tiffy = ITiffy(_tiffy);
        wbnb = IERC20(_wbnb);
        router = IPancakeRouter(_router);
        pool = _pool;
    }

    function feedPool(uint256 amount) external onlyOwner {
        require(tiffy.balanceOf(address(this)) >= amount, "Insufficient TIFFY");
        require(tiffy.transfer(pool, amount), "TIFFY transfer failed");
    }

    function addLiquidity(uint256 tiffyAmount, uint256 wbnbAmount) external onlyOwner {
        require(tiffy.balanceOf(address(this)) >= tiffyAmount, "Insufficient TIFFY");
        require(wbnb.balanceOf(address(this)) >= wbnbAmount, "Insufficient WBNB");
        require(tiffy.approve(address(router), tiffyAmount), "TIFFY approve failed");
        require(wbnb.approve(address(router), wbnbAmount), "WBNB approve failed");
        (,, uint liquidity) = router.addLiquidity(
            address(tiffy),
            address(wbnb),
            tiffyAmount,
            wbnbAmount,
            tiffyAmount * 95 / 100,
            wbnbAmount * 95 / 100,
            msg.sender,
            block.timestamp + 300
        );
        require(liquidity > 0, "Liquidity add failed");
    }

    function setExempt(address[] memory wallets, bool exempt) external onlyOwner {
        tiffy.setFeeExempt(wallets, exempt);
    }

    function withdrawBNB(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient BNB");
        payable(owner()).transfer(amount);
    }

    receive() external payable {}
}
