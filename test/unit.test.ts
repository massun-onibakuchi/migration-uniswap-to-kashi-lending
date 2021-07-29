import hre, { waffle, ethers } from "hardhat";
import { expect, use } from "chai";
import { defaultAbiCoder, toUtf8Bytes } from "ethers/lib/utils";
import { Contract, ContractTransaction, Wallet } from "ethers";
import {
    ERC20Mock,
    MigratorTest,
    IUniswapV2Pair,
    BentoBoxV1,
    KashiPairMediumRiskV1,
    IUniswapV2Factory,
    ERC20,
} from "../typechain";

use(require("chai-bignumber")());

const toWei = ethers.utils.parseEther;
const getEvents = async (contract: Contract, tx: ContractTransaction) => {
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    return receipt.logs.reduce((parsedEvents, log) => {
        try {
            parsedEvents.push(contract.interface.parseLog(log));
        } catch (e) {}
        return parsedEvents;
    }, []);
};

describe("Test", async function () {
    const amount = toWei("1");
    const INITIAL_AMOUNT = toWei("100");
    const [wallet, lp] = waffle.provider.getWallets();

    let token0: ERC20; // Kashi asset0
    let token1: ERC20; // Kashi asset1
    let weth: ERC20; // KashiEth asset
    let migrator: MigratorTest;
    let masterContract: KashiPairMediumRiskV1;
    let kashi0: KashiPairMediumRiskV1;
    let kashi1: KashiPairMediumRiskV1;
    let kashiEth: KashiPairMediumRiskV1;
    let bentoBox: BentoBoxV1;
    let factory: IUniswapV2Factory;
    let pair: IUniswapV2Pair;
    let Token;
    let Migrator;
    let Oracle;
    let BentoBox;
    let Kashi;
    let Factory;
    let Pair;
    before(async function () {
        Migrator = await ethers.getContractFactory("MigratorTest");
        Oracle = await ethers.getContractFactory("PeggedOracleV1");
        BentoBox = await ethers.getContractFactory("BentoBoxV1");
        Kashi = await ethers.getContractFactory("KashiPairMediumRiskV1");
        Token = await ethers.getContractFactory("ERC20Mock");
        Factory = await ethers.getContractFactory("UniswapV2Factory");
        Pair = await ethers.getContractFactory("UniswapV2Pair");
    });
    beforeEach(async function () {
        const oracle = await Oracle.deploy();
        const collateral = (await Token.deploy("Colateral", "COL")) as ERC20Mock;
        token0 = (await Token.deploy("Token0", "TKN0")) as ERC20;
        token1 = (await Token.deploy("Token1", "TKN1")) as ERC20;

        factory = await Factory.deploy(ethers.constants.AddressZero);
        const createPairTx = await factory.createPair(token0.address, token1.address);
        const pairAddr = (await getEvents(factory, createPairTx)).find(e => e.name == "PairCreated").args[2];
        pair = (await ethers.getContractAt("UniswapV2Pair", pairAddr)) as IUniswapV2Pair;

        migrator = (await Migrator.deploy(
            "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
        )) as MigratorTest;

        bentoBox = (await BentoBox.deploy("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2")) as BentoBoxV1;
        masterContract = (await Kashi.deploy(bentoBox.address)) as KashiPairMediumRiskV1;
        // create kashi clone
        [kashi0, kashi1] = await createClone(
            bentoBox,
            masterContract,
            oracle,
            [collateral, collateral],
            [token0, token1],
        );
        // expect(await bentoBox.masterContractOf(kashi0.address)).to.eq(masterContract.address);
        // add initial liquidity
        await addLiquidity(lp, pair, token0, token1, INITIAL_AMOUNT);
    });
    const createClone = async (
        bentoBox,
        masterContract,
        oracle,
        collaterals,
        assets,
    ): Promise<KashiPairMediumRiskV1[]> => {
        const clones = [];
        if (collaterals.length != assets.length) throw Error("collaterals!=assets.length");
        for (let i = 0; i < assets.length; i++) {
            const [col, asset] = [collaterals[i], assets[i]];
            const data = defaultAbiCoder.encode(
                ["address", "address", "address", "bytes"],
                [col.address, asset.address, oracle.address, toUtf8Bytes("")],
            );
            const tx = await bentoBox.deploy(masterContract.address, data, true, { value: toWei("10") });
            const cloneAddress = (await getEvents(bentoBox, tx)).find(e => e.name === "LogDeploy").args[2];
            clones.push(await ethers.getContractAt("KashiPairMediumRiskV1", cloneAddress));
        }
        return clones;
    };
    const addLiquidity = async (signer: Wallet, pair, token0: ERC20, token1: ERC20, amount = toWei("1")) => {
        await token0.mint(pair.address, amount);
        await token1.mint(pair.address, amount);
        await pair.connect(signer).mint(signer.address);
    };
    const redeemLpToken = async (signer: Wallet, amount) => {
        await pair.connect(signer).approve(migrator.address, amount);
        await migrator.redeemLpToken(pair.address);
    };

    it("check:kashi asset address", async function () {
        expect(await kashi0.asset()).to.eq(token0.address);
        expect(await kashi1.asset()).to.eq(token1.address);
    });
    it("redeemLpToken:Redeem the LPtoken held by the contract", async function () {
        await addLiquidity(wallet, pair, token0, token1, amount);

        const balance = await pair.balanceOf(wallet.address);
        expect(balance).not.to.eq(0);

        await redeemLpToken(wallet, balance);

        expect(await pair.balanceOf(migrator.address)).to.eq(0);
        expect(await pair.balanceOf(wallet.address)).to.eq(0);
        expect(await token0.balanceOf(migrator.address)).not.to.eq(0);
        expect(await token1.balanceOf(migrator.address)).not.to.eq(0);
    });
    it("getAmountToDeposit", async function () {
        await token0.mint(wallet.address, toWei("1"));
        const balance = await token0.balanceOf(wallet.address);
        await token0.transfer(migrator.address, balance);
        const { value, amount, share } = await migrator.getAmountToDeposit(kashi0.address, token0.address);
        expect(value).to.eq(0);
        expect(amount).to.eq(balance);
        expect(share).not.to.eq(0);
    });
    it("deposit:Deposit all tokens0 owned by the contract to bentobox.", async function () {
        await addLiquidity(wallet, pair, token0, token1, amount);
        await redeemLpToken(wallet, await pair.balanceOf(wallet.address));
        await migrator.deposit(kashi0.address, token0.address);

        expect(await token0.balanceOf(migrator.address)).to.eq(0);
        expect(await bentoBox.balanceOf(token0.address, kashi0.address)).to.eq(amount);
    });
    it("depositAndAddAsset:Deposit to bentobox and lend token0 to Kashi", async function () {
        await addLiquidity(wallet, pair, token0, token1, amount);
        await redeemLpToken(wallet, await pair.balanceOf(wallet.address));
        await migrator.depositAndAddAsset(kashi0.address, token0.address);

        expect(await token0.balanceOf(migrator.address)).to.eq(0);
        expect(await bentoBox.balanceOf(token0.address, kashi0.address)).to.eq(amount);
        expect(await kashi0.balanceOf(wallet.address)).not.to.eq(0);
    });
    const migrateLpToKashi = async (signer, kashi0, kashi1, tokenA, tokenB, factory) => {
        await addLiquidity(signer, pair, tokenA, tokenB);
        await pair.approve(migrator.address, await pair.balanceOf(signer.address));
        await migrator.migrateLpToKashi(kashi0.address, kashi1.address, factory.address);
    };
    it("migrateLpToKashi:correct order of arguments", async function () {
        await migrateLpToKashi(wallet, kashi0, kashi1, token0, token1, factory);
        expect(await token0.balanceOf(migrator.address)).to.eq(0);
        expect(await bentoBox.balanceOf(token0.address, kashi0.address)).to.eq(amount);
        expect(await kashi0.balanceOf(wallet.address)).not.to.eq(0);
    });
    it("migrateLpToKashi:Reverse order of arguments", async function () {
        await migrateLpToKashi(wallet, kashi0, kashi1, token1, token0, factory);

        expect(await token0.balanceOf(migrator.address)).to.eq(0);
        expect(await bentoBox.balanceOf(token0.address, kashi0.address)).to.eq(amount);
        expect(await kashi0.balanceOf(wallet.address)).not.to.eq(0);
    });
});
