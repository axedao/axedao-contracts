const { ethers, timeAndMine } = require('hardhat')
const { expect } = require('chai')
const { BigNumber } = require('@ethersproject/bignumber')
const { formatUnits, formatEther } = require('@ethersproject/units')

describe('Bonding', () => {
  // Large number for approval for DAI
  const largeApproval = '100000000000000000000000000000000'

  // What epoch will be first epoch
  const firstEpochNumber = '0'

  // How many seconds are in each epoch
  const epochLength = 86400 / 3

  // Ethereum 0 address, used when toggling changes in treasury
  const zeroAddress = '0x0000000000000000000000000000000000000000'

  // Initial staking index
  const initialIndex = '1000000000'

  const daoAddr = '0x176311b81309240a8700BCC6129D5dF85087358D'

  let // Used as default deployer for contracts, asks as owner of contracts.
    deployer,
    // Used as the default user for deposits and trade. Intended to be the default regular user.
    depositor,
    axe,
    sAxe,
    dai,
    treasury,
    staking,
    stakingHelper,
    daiBond,
    firstEpochTime

  beforeEach(async () => {
    ;[deployer, depositor] = await ethers.getSigners()

    firstEpochTime = (await deployer.provider.getBlock()).timestamp - 100

    const AXE = await ethers.getContractFactory('AxeERC20')
    axe = await AXE.deploy()
    await axe.setVault(deployer.address)

    const DAI = await ethers.getContractFactory('DAI')
    dai = await DAI.deploy(0)

    const StakedAXE = await ethers.getContractFactory('StakedAxeERC20')
    sAxe = await StakedAXE.deploy()

    const Treasury = await ethers.getContractFactory('AxeTreasury')
    treasury = await Treasury.deploy(
      axe.address,
      dai.address,
      zeroAddress,
      zeroAddress,
      0
    )

    const DAIBond = await ethers.getContractFactory('AxeBondDepository')
    daiBond = await DAIBond.deploy(
      axe.address,
      dai.address,
      treasury.address,
      daoAddr,
      zeroAddress
    )

    const Staking = await ethers.getContractFactory('AxeStaking')
    staking = await Staking.deploy(
      axe.address,
      sAxe.address,
      epochLength,
      firstEpochNumber,
      firstEpochTime
    )

    // Deploy staking helper
    const StakingHelper = await ethers.getContractFactory('AxeStakingHelper')
    stakingHelper = await StakingHelper.deploy(staking.address, axe.address)

    const StakingWarmup = await ethers.getContractFactory('AxeStakingWarmup')
    const stakingWarmup = await StakingWarmup.deploy(
      staking.address,
      sAxe.address
    )

    await sAxe.initialize(staking.address)
    await sAxe.setIndex(initialIndex)

    await staking.setContract('1', stakingWarmup.address)

    await axe.setVault(treasury.address)

    // queue and toggle deployer reserve depositor
    await treasury.queue('0', deployer.address)
    await treasury.toggle('0', deployer.address, zeroAddress)

    await treasury.queue('0', daiBond.address)
    await treasury.toggle('0', daiBond.address, zeroAddress)

    await daiBond.setStaking(stakingHelper.address, true)

    await axe.approve(stakingHelper.address, largeApproval)
    await dai.approve(treasury.address, largeApproval)
    await dai.approve(daiBond.address, largeApproval)

    // mint 1,000,000 DAI for testing
    await dai.mint(
      deployer.address,
      BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18))
    )
  })

  describe('deposit', () => {
    it('should get vested fully', async () => {
      await treasury.deposit(
        BigNumber.from(10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(7500).mul(BigNumber.from(10).pow(9))
      )

      const bcv = 300
      const bondVestingLength = 10
      const minBondPrice = 400 // bond price = $4
      const maxBondPayout = 1000 // 1000 = 1% of AXE total supply
      const daoFee = 10000 // DAO fee for bond
      const maxBondDebt = '8000000000000000'
      const initialBondDebt = 0
      await daiBond.initializeBondTerms(
        bcv,
        bondVestingLength,
        minBondPrice,
        maxBondPayout, // Max bond payout,
        daoFee,
        maxBondDebt,
        initialBondDebt
      )

      let bondPrice = await daiBond.bondPriceInUSD()
      console.log('bond price: ' + formatEther(bondPrice))

      let depositAmount = BigNumber.from(100).mul(BigNumber.from(10).pow(18))
      await daiBond.deposit(depositAmount, largeApproval, deployer.address)

      const prevDAOReserve = await axe.balanceOf(daoAddr)
      expect(prevDAOReserve).to.eq(
        BigNumber.from(25).mul(BigNumber.from(10).pow(9))
      )
      console.log('dao balance: ' + formatUnits(prevDAOReserve, 9))

      await timeAndMine.setTimeIncrease(2)

      await expect(() =>
        daiBond.redeem(deployer.address, false)
      ).to.changeTokenBalance(
        axe,
        deployer,
        BigNumber.from(5).mul(BigNumber.from(10).pow(9))
      )

      // bond 2nd times
      bondPrice = await daiBond.bondPriceInUSD()
      console.log('bond price: ' + formatEther(bondPrice))

      depositAmount = BigNumber.from(100).mul(BigNumber.from(10).pow(18))

      await daiBond.deposit(depositAmount, largeApproval, deployer.address)
      console.log(
        'dao balance: ' + formatUnits(await axe.balanceOf(daoAddr), 9)
      )
      expect(await axe.balanceOf(daoAddr)).to.eq('35834236186')

      await timeAndMine.setTimeIncrease(20)
      await expect(() =>
        daiBond.redeem(deployer.address, false)
      ).to.changeTokenBalance(axe, deployer, '30834236186')
    })

    it('should get vested partially', async () => {
      await treasury.deposit(
        BigNumber.from(10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(7500).mul(BigNumber.from(10).pow(9))
      )

      const bcv = 300
      const bondVestingLength = 10
      const minBondPrice = 400 // bond price = $4
      const maxBondPayout = 1000 // 1000 = 1% of AXE total supply
      const daoFee = 10000 // DAO fee for bond
      const maxBondDebt = '8000000000000000'
      const initialBondDebt = 0
      await daiBond.initializeBondTerms(
        bcv,
        bondVestingLength,
        minBondPrice,
        maxBondPayout, // Max bond payout,
        daoFee,
        maxBondDebt,
        initialBondDebt
      )

      const bondPrice = await daiBond.bondPriceInUSD()

      const depositAmount = BigNumber.from(100).mul(BigNumber.from(10).pow(18))
      const totalAxe = depositAmount
        .div(bondPrice)
        .mul(BigNumber.from(10).pow(9))
      await daiBond.deposit(depositAmount, largeApproval, deployer.address)

      // vested 20%
      await timeAndMine.setTimeIncrease(2)
      await expect(() =>
        daiBond.redeem(deployer.address, false)
      ).to.changeTokenBalance(axe, deployer, totalAxe.div(5))

      // fully vested, get rest 80%
      await timeAndMine.setTimeIncrease(10)
      await expect(() =>
        daiBond.redeem(deployer.address, false)
      ).to.changeTokenBalance(axe, deployer, totalAxe - totalAxe.div(5))
    })

    it('should staked directly', async () => {
      await treasury.deposit(
        BigNumber.from(10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(7500).mul(BigNumber.from(10).pow(9))
      )

      const bcv = 300
      const bondVestingLength = 10
      const minBondPrice = 400 // bond price = $4
      const maxBondPayout = 1000 // 1000 = 1% of AXE total supply
      const daoFee = 10000 // DAO fee for bond
      const maxBondDebt = '8000000000000000'
      const initialBondDebt = 0
      await daiBond.initializeBondTerms(
        bcv,
        bondVestingLength,
        minBondPrice,
        maxBondPayout, // Max bond payout,
        daoFee,
        maxBondDebt,
        initialBondDebt
      )

      let bondPrice = await daiBond.bondPriceInUSD()
      console.log('bond price: ' + formatEther(bondPrice))

      let depositAmount = BigNumber.from(100).mul(BigNumber.from(10).pow(18))
      await daiBond.deposit(depositAmount, largeApproval, deployer.address)

      const prevDAOReserve = await axe.balanceOf(daoAddr)
      expect(prevDAOReserve).to.eq(
        BigNumber.from(25).mul(BigNumber.from(10).pow(9))
      )
      console.log('dao balance: ' + formatUnits(prevDAOReserve, 9))

      await timeAndMine.setTimeIncrease(2)

      await daiBond.redeem(deployer.address, true)

      expect(await sAxe.balanceOf(deployer.address)).to.eq('5000000000')
    })
  })
})
