const { ethers } = require('hardhat')
const { expect } = require('chai')
const { BigNumber } = require('@ethersproject/bignumber')

describe('AxeBondingCalculator', () => {
  let // Used as default deployer for contracts, asks as owner of contracts.
    deployer,
    // Used as the default user for deposits and trade. Intended to be the default regular user.
    depositor,
    AXE,
    axe,
    DAI,
    dai,
    UniswapV2FactoryContract,
    uniFactory,
    pairAddress,
    UniswapV2Pair,
    lp,
    BondingCalcContract,
    bondingCalc

  beforeEach(async () => {
    ;[deployer, depositor] = await ethers.getSigners()

    AXE = await ethers.getContractFactory('AxeERC20')
    axe = await AXE.connect(deployer).deploy()
    await axe.setVault(deployer.address)

    DAI = await ethers.getContractFactory('DAI')
    dai = await DAI.connect(deployer).deploy(0)

    UniswapV2FactoryContract = await ethers.getContractFactory(
      'UniswapV2Factory'
    )
    uniFactory = await UniswapV2FactoryContract.connect(deployer).deploy(
      deployer.address
    )

    await uniFactory.connect(deployer).createPair(axe.address, dai.address)
    pairAddress = await uniFactory.getPair(axe.address, dai.address)
    UniswapV2Pair = await ethers.getContractFactory('UniswapV2Pair')
    lp = await UniswapV2Pair.attach(pairAddress)

    BondingCalcContract = await ethers.getContractFactory(
      'AxeBondingCalculator'
    )
    bondingCalc = await BondingCalcContract.connect(deployer).deploy(
      axe.address
    )
  })

  describe('getKValue', () => {
    it('should return x*y', async () => {
      const axeAmount = BigNumber.from(100).mul(BigNumber.from(10).pow(9))
      const daiAmount = BigNumber.from(400).mul(BigNumber.from(10).pow(18))
      await axe.mint(deployer.address, axeAmount)
      await dai.mint(deployer.address, daiAmount)

      await axe.transfer(lp.address, axeAmount)
      await dai.transfer(lp.address, daiAmount)
      await lp.mint(deployer.address)

      const k = await bondingCalc.getKValue(lp.address)

      expect(k).to.eq(
        BigNumber.from(100).mul(400).mul(BigNumber.from(10).pow(18))
      )
    })
  })

  describe('getTotalValue', () => {
    it('should return total value in USD', async () => {
      const axeAmount = BigNumber.from(100).mul(BigNumber.from(10).pow(9))
      const daiAmount = BigNumber.from(400).mul(BigNumber.from(10).pow(18))
      await axe.mint(deployer.address, axeAmount)
      await dai.mint(deployer.address, daiAmount)

      await axe.transfer(lp.address, axeAmount)
      await dai.transfer(lp.address, daiAmount)
      await lp.mint(deployer.address)

      const totalValue = await bondingCalc.getTotalValue(lp.address)

      expect(totalValue).to.eq(400000000000)
    })
  })
})
