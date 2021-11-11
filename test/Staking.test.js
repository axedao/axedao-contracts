const { ethers, timeAndMine } = require('hardhat')
const { expect } = require('chai')
const { BigNumber } = require('@ethersproject/bignumber')

describe('Staking', () => {
  // Large number for approval for DAI
  const largeApproval = '100000000000000000000000000000000'

  // What epoch will be first epoch
  const firstEpochNumber = '0'

  // How many seconds are in each epoch
  const epochLength = 86400 / 3

  // Initial reward rate for epoch
  const initialRewardRate = '3000'

  // Ethereum 0 address, used when toggling changes in treasury
  const zeroAddress = '0x0000000000000000000000000000000000000000'

  // Initial staking index
  const initialIndex = '1000000000'

  let // Used as default deployer for contracts, asks as owner of contracts.
    deployer,
    // Used as the default user for deposits and trade. Intended to be the default regular user.
    depositor,
    axe,
    sAxe,
    dai,
    treasury,
    stakingDistributor,
    staking,
    stakingHelper,
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

    const StakingDistributor = await ethers.getContractFactory(
      'AxeStakingDistributor'
    )
    stakingDistributor = await StakingDistributor.deploy(
      treasury.address,
      axe.address,
      epochLength,
      firstEpochTime
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

    await staking.setContract('0', stakingDistributor.address)
    await staking.setContract('1', stakingWarmup.address)

    await stakingDistributor.addRecipient(staking.address, initialRewardRate)

    await axe.setVault(treasury.address)

    // queue and toggle reward manager
    await treasury.queue('8', stakingDistributor.address)
    await treasury.toggle('8', stakingDistributor.address, zeroAddress)

    // queue and toggle deployer reserve depositor
    await treasury.queue('0', deployer.address)
    await treasury.toggle('0', deployer.address, zeroAddress)

    await axe.approve(stakingHelper.address, largeApproval)
    await dai.approve(treasury.address, largeApproval)

    // mint 1,000,000 DAI for testing
    await dai.mint(
      deployer.address,
      BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18))
    )
  })

  describe('treasury deposit', () => {
    it('should get AXE', async () => {
      await expect(() =>
        treasury.deposit(
          BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18)),
          dai.address,
          BigNumber.from(750000).mul(BigNumber.from(10).pow(9))
        )
      ).to.changeTokenBalance(
        axe,
        deployer,
        BigNumber.from(25 * 10000).mul(BigNumber.from(10).pow(9))
      )
    })
  })

  describe('stake', () => {
    it('should get equally sAxe tokens', async () => {
      await treasury.deposit(
        BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(750000).mul(BigNumber.from(10).pow(9))
      )

      await expect(() =>
        stakingHelper.stake(
          BigNumber.from(100).mul(BigNumber.from(10).pow(9)),
          deployer.address
        )
      ).to.changeTokenBalance(
        sAxe,
        deployer,
        BigNumber.from(100).mul(BigNumber.from(10).pow(9))
      )
    })
  })

  describe('rebase', () => {
    it('distribute 0 for first block', async () => {
      await treasury.deposit(
        BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(750000).mul(BigNumber.from(10).pow(9))
      )

      await stakingHelper.stake(
        BigNumber.from(100).mul(BigNumber.from(10).pow(9)),
        deployer.address
      )

      await expect(() => staking.rebase()).to.changeTokenBalance(
        sAxe,
        deployer,
        0
      )

      expect(await sAxe.index()).to.eq('1000000000')
    })

    it('should rebase after epoch end', async () => {
      await treasury.deposit(
        BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(750000).mul(BigNumber.from(10).pow(9))
      )

      await stakingHelper.stake(
        BigNumber.from(100).mul(BigNumber.from(10).pow(9)),
        deployer.address
      )

      // 0 -> 1: no reward
      await expect(() => staking.rebase()).to.changeTokenBalance(
        sAxe,
        deployer,
        0
      )

      const epoch = await staking.epoch()
      const distribute = epoch[3]

      // advanced next block time to next epoch
      await timeAndMine.setTimeIncrease(86400 / 3 + 1)

      // 1 -> 2
      await expect(() => staking.rebase()).to.changeTokenBalance(
        sAxe,
        deployer,
        distribute
      )
      expect(await sAxe.index()).to.eq('8500000000')
    })

    it('should not rebase before epoch end', async () => {
      await treasury.deposit(
        BigNumber.from(100 * 10000).mul(BigNumber.from(10).pow(18)),
        dai.address,
        BigNumber.from(750000).mul(BigNumber.from(10).pow(9))
      )

      await stakingHelper.stake(
        BigNumber.from(100).mul(BigNumber.from(10).pow(9)),
        deployer.address,
      )

      // 0 -> 1: no reward
      await expect(() => staking.rebase()).to.changeTokenBalance(
        sAxe,
        deployer,
        0
      )

      // advanced next block time to next epoch
      await timeAndMine.setTimeIncrease(86400 / 3 - 200)

      // 1 -> 1
      await expect(() => staking.rebase()).to.changeTokenBalance(
        sAxe,
        deployer,
        0
      )

      const [, number, endTime, distribute] = await staking.epoch()
      expect(number).to.eq(1)
      expect(endTime).to.eq(firstEpochTime + 86400 / 3)
      expect(distribute).to.eq('750000000000')
    })
  })
})
