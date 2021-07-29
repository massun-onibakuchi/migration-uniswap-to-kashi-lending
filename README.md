# Lp-token-to-kashi-migrator
The `Migrator` contract in this repository migrates the LP token of UniswapV2 (Sushiswap) to Kashi of sushiswap.

## Concept
Among DeFi, the sushiswap ecosystem and development is expanding rapidly. Kashi is a relatively recent product of sushiswap, which features an elastic interest model and Isolated lending pairs. Also,Kashi has an abundance of lending pairs and allows you to freely choose your risk.

Liquidity providing  in Dex involves impermanent loss. However, since kashi is a lending financial service, there is no need to worry about impermanent loss. The concept of this repository is to create a gateway to lend each of the tokens that make up an LP token to Kashi.

## Usage
### Setup
To install dependencies, run

`yarn`

You will needs to enviroment variables to run mainnet forking. Create a .env file in the root directory of your project. 

```
# To fetch external contracts ABI via Etherscan API
ETHERSCAN_API_KEY=
# To fork mainnet states.
ALCHEMY_API_KEY=
BLOCK_NUMBER=12894125
```
You will get the first one from Etherscan. You will get the second one from Alchemy.

### Complipe
`yarn compile`

### Test
`yarn test`

## Risks
The risks of liquidity providing and lending are different.

[Market Risk Assessment](https://docs.aave.com/risk/audits/gauntlet#cascading-liquidations)

## ToDo
 - Test ETH and ERC20 token pair

## Link
[Sushiswap: BentoBox Overview](https://dev.sushi.com/bentobox/bentobox-overview)