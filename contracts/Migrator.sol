// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import { IERC20, IBentoBoxV1, KashiPairMediumRiskV1 as Kashi } from "./bentobox/KashiPairMediumRiskV1.sol";

import "hardhat/console.sol";

contract Migrator {
    address public immutable WETH;

    event Migrate(address indexed from, Kashi indexed kashi0, Kashi indexed kashi1, uint256 LpTokens);

    constructor(address _WETH) public {
        WETH = _WETH;
    }

    /// @notice Migrate caller UniswapV2 or Sushiswap LpToken to Kashi
    /// assuming caller approved this contract using caller's LpToken
    /// @dev args are in no particular order
    /// @param kashi0 kashi0
    /// @param kashi1 kashi1
    /// @param factory UniswapV2 or Sushiswap factory
    function migrateLpToKashi(
        Kashi kashi0,
        Kashi kashi1,
        address factory
    ) public {
        address asset0 = address(kashi0.asset());
        address asset1 = address(kashi1.asset());
        address token0 = asset0 == address(0) ? WETH : asset0;
        address token1 = asset1 == address(0) ? WETH : asset1;

        address pair = IUniswapV2Factory(factory).getPair(token0, token1);
        require(pair != address(0));
        IUniswapV2Pair pool = IUniswapV2Pair(pair);

        // --- redeem instead of caller---
        uint256 amount = pool.balanceOf(msg.sender);
        pool.transferFrom(msg.sender, address(this), amount);
        _redeemLpToken(pool, amount);

        // --- deposit and add asset ---
        _depositAndAddAsset(kashi0, asset0);
        _depositAndAddAsset(kashi1, asset1);

        emit Migrate(msg.sender, kashi0, kashi1, amount);
    }

    /// @notice assuming caller approved this contract
    /// @dev call pair directly. assuming Lp token is transfered to this contract
    /// underlying tokens (tokenA,tokenB) are transfered to this contract.
    function _redeemLpToken(IUniswapV2Pair pair, uint256 amount) internal {
        pair.transfer(address(pair), amount);
        pair.burn(address(this));
    }

    function _depositAndAddAsset(Kashi kashi, address asset) internal {
        (, , uint256 share) = _deposit(kashi.bentoBox(), address(kashi), asset);
        kashi.addAsset(msg.sender, true, share);
    }

    /// @notice deposit asset to bentoBox
    /// @dev asset is ERC20 or eth
    /// @param bentoBox bentobox to deposit
    /// @param to receiver that receives interest bearing token
    /// @param asset if eth, zero addrss
    /// @return value eth amount which transfer to bentoBox
    /// @return amount asset amount to deposit
    /// @return share interest bearing token amount
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
        if (asset != address(0)) {
            IERC20(asset).approve(address(bentoBox), amount);
        }
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
