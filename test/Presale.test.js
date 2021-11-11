const { ethers } = require('hardhat')
const { expect } = require('chai')
const { BigNumber } = require('@ethersproject/bignumber')

describe('Presale', () => {
  // Large number for approval for DAI
  const largeApproval = '100000000000000000000000000000000'

  // Ethereum 0 address, used when toggling changes in treasury
  const zeroAddress = '0x0000000000000000000000000000000000000000'

  let // Used as default deployer for contracts, asks as owner of contracts.
    deployer,
    // Used as the default user for deposits and trade. Intended to be the default regular user.
    depositor,
    axe,
    pAxe,
    exercisePreAxe,
    dai,
    treasury

  beforeEach(async () => {
    ;[deployer, depositor] = await ethers.getSigners()

    firstEpochTime = (await deployer.provider.getBlock()).timestamp - 100

    const CLAM = await ethers.getContractFactory('AxeERC20')
    axe = await CLAM.deploy()
    await axe.setVault(deployer.address)

    const DAI = await ethers.getContractFactory('DAI')
    dai = await DAI.deploy(0)

    const PreAxeERC20 = await ethers.getContractFactory(
      'PreAxeERC20'
    )
    pAxe = await PreAxeERC20.deploy()

    const Treasury = await ethers.getContractFactory('AxeTreasury')
    treasury = await Treasury.deploy(
      axe.address,
      dai.address,
      zeroAddress,
      zeroAddress,
      0
    )

    const AxeCirculatingSupply = await ethers.getContractFactory(
      'AxeCirculatingSupply'
    )
    const axeCirculatingSupply = await AxeCirculatingSupply.deploy(
      deployer.address
    )
    await axeCirculatingSupply.initialize(axe.address)

    const ExercisePreAxe = await ethers.getContractFactory('ExercisePreAxe')
    exercisePreAxe = await ExercisePreAxe.deploy(
      pAxe.address,
      axe.address,
      dai.address,
      treasury.address,
      axeCirculatingSupply.address
    )

    await axe.setVault(treasury.address)

    // queue and toggle deployer reserve depositor
    await treasury.queue('0', deployer.address)
    await treasury.toggle('0', deployer.address, zeroAddress)

    await treasury.queue('0', exercisePreAxe.address)
    await treasury.toggle('0', exercisePreAxe.address, zeroAddress)

    await dai.approve(treasury.address, largeApproval)
    await dai.approve(exercisePreAxe.address, largeApproval)
    await pAxe.approve(exercisePreAxe.address, largeApproval)

    // mint 1,000,000 DAI for testing
    await dai.mint(
      deployer.address,
      BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18))
    )

    // mint 250,000 CLAM for testing
    treasury.deposit(
      BigNumber.from(50 * 10000).mul(BigNumber.from(10).pow(18)),
      dai.address,
      BigNumber.from(25 * 10000).mul(BigNumber.from(10).pow(9))
    )
  })

  describe('exercise', () => {
    it('should get reverted', async () => {
      await exercisePreAxe.setTerms(
        deployer.address,
        BigNumber.from(30000).mul(BigNumber.from(10).pow(18)),
        10 * 10000 // 10%
      )

      await expect(
        exercisePreAxe.exercise(
          BigNumber.from(30000).mul(BigNumber.from(10).pow(18))
        )
      ).to.be.revertedWith('Not enough vested')
    })

    it('should get axe', async () => {
      await exercisePreAxe.setTerms(
        deployer.address,
        BigNumber.from(30000).mul(BigNumber.from(10).pow(18)),
        10 * 10000 // 10%
      )

      await expect(() =>
        exercisePreAxe.exercise(
          BigNumber.from(10000).mul(BigNumber.from(10).pow(18))
        )
      ).to.changeTokenBalance(
        axe,
        deployer,
        BigNumber.from(10000).mul(BigNumber.from(10).pow(9))
      )
      expect(await dai.balanceOf(deployer.address)).to.eq(
        BigNumber.from(490000).mul(BigNumber.from(10).pow(18))
      )
      expect(await pAxe.balanceOf(deployer.address)).to.eq(
        '999990000000000000000000000'
      )
    })
  })
})
