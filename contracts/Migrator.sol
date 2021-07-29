// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import { IERC20, IBentoBoxV1, KashiPairMediumRiskV1 as Kashi } from "./bentobox/KashiPairMediumRiskV1.sol";

import "hardhat/console.sol";

contract Migrator {
    address public immutable factory;
    address public immutable WETH;

    event Migrate(address indexed from, Kashi indexed kashi0, Kashi indexed kashi1, address pair);

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    function migrateLpToKashi(
        Kashi kashi0,
        Kashi kashi1,
        address tokenA,
        address tokenB
    ) public {
        address pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0));
        IUniswapV2Pair pool = IUniswapV2Pair(pair);

        if (tokenA == WETH) {
            tokenA = address(0);
        } else if (tokenB == WETH) {
            tokenB = address(0);
        }
        // below here WETH == address(0)
        address asset0 = address(kashi0.asset());
        address asset1 = address(kashi1.asset());
        _validateInput(tokenA, tokenB, asset0, asset1);

        (address token0, address token1) = asset0 == tokenA ? (tokenA, tokenB) : (tokenB, tokenA);

        // --- redeem instead of caller---
        uint256 amount = pool.balanceOf(msg.sender);
        pool.transferFrom(msg.sender, address(this), amount);
        _redeemLpToken(pool, amount);

        // --- deposit and add asset ---
        (, , uint256 share0) = _deposit(kashi0.bentoBox(), address(kashi0), token0);
        kashi0.addAsset(msg.sender, true, share0);

        (, , uint256 share1) = _deposit(kashi1.bentoBox(), address(kashi1), token1);
        kashi1.addAsset(msg.sender, true, share1);

        emit Migrate(msg.sender, kashi0, kashi1, pair);
    }

    function _validateInput(
        address tokenA,
        address tokenB,
        address assetA,
        address assetB
    ) internal view {
        require((assetA == tokenA && assetB == tokenB) || (assetA == tokenB && assetB == tokenA), "invalid-asset-address-pair");
        require(tokenA != tokenB, "identical-address");
    }

    /// @notice assuming caller approve this contract
    /// @dev Explain to a developer any extra details
    /// assuming Lp token is transfered to this contract
    function _redeemLpToken(IUniswapV2Pair pair, uint256 amount) internal {
        pair.transfer(address(pair), amount);
        pair.burn(address(this));
    }

    function _deposit(
        IBentoBoxV1 bentoBox,
        address to,
        address asset
    )
        internal
        returns (
            uint256 value,
            uint256 amount,
            uint256 share
        )
    {
        (value, amount, share) = _getAmountToDeposit(bentoBox, asset);
        IERC20(asset).approve(address(bentoBox),amount);
        bentoBox.deposit{ value: value }(IERC20(asset), address(this), to, amount, 0);
    }

    function _getAmountToDeposit(IBentoBoxV1 bentoBox, address asset)
        internal
        view
        returns (
            uint256 value,
            uint256 amount,
            uint256 share
        )
    {
        if (asset == address(0)) {
            value = address(this).balance;
            amount = value;
            share = bentoBox.toShare(IERC20(asset), amount, false);
        } else {
            amount = IERC20(asset).balanceOf(address(this));
            share = bentoBox.toShare(IERC20(asset), amount, false);
        }
    }

    receive() external payable {}
}
