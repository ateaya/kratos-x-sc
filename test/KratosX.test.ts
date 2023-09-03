// To run this test
// npx hardhat test
import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { assert } from "console";
import { ethers, upgrades } from "hardhat";
import { Contract } from "hardhat/internal/hardhat-network/stack-traces/model";
import { Mutex } from "async-mutex";
import { BaseContract } from "ethers";
import { string } from "hardhat/internal/core/params/argumentTypes";
const helpers = require("@nomicfoundation/hardhat-network-helpers");
import "@nomicfoundation/hardhat-chai-matchers";
import exp from "constants";

let SlotPrice = 0;


interface ContractCollection {
    kratosx: ethers.BaseContract;
    usdc: ethers.BaseContract;
}
interface AccountCollection {
    kratosx: ethers.HardhatEthersSigner;
    usdc: ethers.HardhatEthersSigner;
    user1: ethers.HardhatEthersSigner;
    user2: ethers.HardhatEthersSigner;
}

interface ValidationData {
    initialAvailableSlotCount: number;
    initialDeposits: Array<any>;
    initialBalance: number;
    initialAllowance: number;
}

interface DepositRecord {
    id: number;
    owner: string,
    approveTimestamp: number,
    lockingPeriod: number,
    hasEarlyAdoptBonus: boolean,
    hasExtendPeriodBonus: boolean,
}

const LockPeriod = {
    SixMonths: 0,
    OneYear: 1,
    TwoYears: 2,
    ThreeYears: 3,
    FourYears: 4,
    FiveYears: 5,
}


class Storage {
    contract: any = undefined;
    constructor(contract: any) {
        this.contract = contract;
    }

    convertDepositDataArray(results) {
        return results.map((item) => {
            return {
                id: item[0],
                owner: item[1],
                approveTimestamp: item[2],
                lockingPeriod: item[3],
                hasEarlyAdoptBonus: item[4],
                hasExtendPeriodBonus: item[5],
            }
        });
    }
    async getAt(pointer: number): Promise<number> {
        return await helpers.getStorageAt(this.contract.target, pointer);
    }
    async getInt(pointer: number): Promise<number> {
        return parseInt(await helpers.getStorageAt(this.contract.target, pointer));
    }
    async getBool(pointer: number): Promise<boolean> {
        return parseInt(await helpers.getStorageAt(this.contract.target, pointer)) == 1;
    }


    async getTotalAmount(): Promise<number> {
        return await this.getInt(1);
    }
    async getSlotCount(): Promise<number> {
        return await this.getInt(2);
    }
    async getSlotValue(): Promise<number> {
        return await this.getInt(3);
    }
    async getEarlyAdoptBonus(): Promise<number> {
        return await this.getInt(4);
    }

}

describe("KratosX basic testing", function () {

    function wad(dollars) {
        return dollars * 1000000;
    }

    // expectedCollectionLengths
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function initEnvironment() {
        const signers = await ethers.getSigners();
        const accounts: AccountCollection = {
            kratosx: signers[0],
            usdc: signers[1],
            user1: signers[2],
            user2: signers[3],
        }

        // Token deployment
        const USDCFactory = (await ethers.getContractFactory('TestUSDC')).connect(accounts.usdc);
        const USDCInstance = await USDCFactory.deploy();
        await USDCInstance.transfer(accounts.kratosx.address, wad(10000000));
        await USDCInstance.transfer(accounts.user1.address, wad(1000000));
        await USDCInstance.transfer(accounts.user2.address, wad(100000));

        expect(await USDCInstance.balanceOf(accounts.kratosx.address)).to.be.equal(wad(10000000));
        expect(await USDCInstance.balanceOf(accounts.user1.address)).to.be.equal(wad(1000000));
        expect(await USDCInstance.balanceOf(accounts.user2.address)).to.be.equal(wad(100000));

        // Contract deployment
        const kratosXVaultFactory = (await ethers.getContractFactory("KratosX")).connect(accounts.kratosx);
        const kratoXInstance = await kratosXVaultFactory.deploy(USDCInstance.getAddress());

        SlotPrice = parseInt(await kratoXInstance.getSlotValue());
        expect(SlotPrice).to.be.equal(5000000000);

        const storage = new Storage(kratoXInstance);

        const contracts: ContractCollection = {
            kratosx: kratoXInstance,
            usdc: USDCInstance,
        }

        return { contracts, accounts, storage };
    }

    function calculateYield(days, earlyAdoptBonus, extendBonus): number {
        if (days <= 180) {
            return 0;
        }

        let percent = calculatePercentage(days);

        if (days > 1825) {
            days = 1825;
        }

        if(earlyAdoptBonus) {
            percent += 1;
        }

        if(extendBonus && days >= 365) {
            percent += 1;
        }

        return Math.floor(SlotPrice * percent * days / (100 * 365));
    }

    function calculateFullValue(days, earlyAdoptBonus, extendBonus): number {
        return SlotPrice + calculateYield(days, earlyAdoptBonus, extendBonus);
    }

    async function timeWarpDays(days) {
        await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
    }


    function calculatePercentage(days): number {
        if (days <= 180) {
            return 0;
        } else if (days <= 365) {    //  < 1 year
            return 5;
        } else if (days <= 730) {    //  1 years < days > 2 years
            return 5;
        } else if (days <= 1095) {   //  2 years < days > 3 years
            return 6;
        } else if (days <= 1460) {   //  3 years < days > 4 years
            return 7;
        } else if (days <= 1825) {   //  4 years < days > 5 years
            return 8;
        }

        return 9;
    }

    describe("Pause the contract", () => {
        it("Call functions that require the contract to be running");
        it("Call functions that are ok even when paused");
    });

    describe("Call contract functions you're not supposed to call", () => {
        it("Call owner functions with another user");
    });


    describe("Yield calculation", () => {

        it("Calculate yield below 6 months", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const depositValue = wad(100000);

            async function testInterval(earlyAdoptBonus, extendBonus) {
                let calculatedYield = await contracts.kratosx.calculateYield(0, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(0, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(30, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(30, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(60, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(60, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(90, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(90, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(179, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(179, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(180, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(180, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });

        it("Calculate yield below 2 years", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const depositValue = wad(100000);
            let calculatedYield = 0;


            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(180, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(180, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(300, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(300, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(364, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(364, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(365, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(365, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(366, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(366, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(729, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(729, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(730, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(730, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(731, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(731, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);

        });

        it("Calculate yield below 3 years", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const depositValue = wad(100000);
            let calculatedYield = 0;


            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(1093, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1093, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1094, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1094, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1095, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1095, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1096, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1096, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });

        it("Calculate yield below 4 years", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const depositValue = wad(100000);
            let calculatedYield = 0;



            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(1458, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1458, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1459, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1459, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1460, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1460, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1461, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1461, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });

        it("Calculate yield below 5 years", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            let calculatedYield = 0;

            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(1823, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1823, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1824, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1824, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1825, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1826, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1826, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });

        it("Calculate yield above 5 years", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const depositValue = wad(100000);
            let calculatedYield = 0;



            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(1825, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1826, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1826, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1827, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1826, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(1828, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1826, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(5000, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1826, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(10000, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(1826, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });

        it("Calculate yield weird values", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const depositValue = wad(100000);
            let calculatedYield = 0;


            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(0, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(0, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });
    });

    class Helpers {
        contracts: ContractCollection;
        accounts: AccountCollection;
        validationData: ValidationData;
        valueChecks: boolean;

        constructor(contracts: ContractCollection, accounts: AccountCollection) {
            this.contracts = contracts;
            this.accounts = accounts;
            this.valueChecks = false;
            this.validationData = {
                initialAvailableSlotCount: 0,
                initialDeposits: [],
                initialBalance: 0,
                initialAllowance: 0,
            };

        }

        convertDepositData(item): DepositRecord {
            return {
                id: item[0],
                owner: item[1],
                approveTimestamp: item[2],
                lockingPeriod: item[3],
                hasEarlyAdoptBonus: item[4],
                hasExtendPeriodBonus: item[5],
            }
        }

        convertDepositDataArray(results): DepositRecord[] {
            return results.map((item) => {
                return this.convertDepositData(item);
            });
        }

        getUsedSlots = async (): Promise<DepositRecord[]> => {
            return this.convertDepositDataArray(await this.contracts.kratosx.getUsedSlots());
        }

        getSlotValue = async () => {
            await this.contracts.kratosx.getSlotValue();
        }

        timeWarpDays = async (days) => {
            await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
        }

        getInitialValidationData = async (): Promise<ValidationData> => {
            return {
                initialAvailableSlotCount: parseInt(await this.contracts.kratosx.getAvailableSlotCount()),
                initialDeposits: await this.contracts.kratosx.getUsedSlots(),
                initialBalance: parseInt(await this.contracts.usdc.balanceOf(this.accounts.user1.address)),
                initialAllowance: parseInt(await this.contracts.usdc.allowance(this.accounts.user1.address, this.accounts.kratosx.address)),
            }
        }

        requestDeposit = async (user, value, signer = user) => {
            const kratosxContractAddress = await this.contracts.kratosx.getAddress();
            const contract = await this.contracts.usdc.connect(signer);

            await expect(contract.approve(kratosxContractAddress, value))
                .to.emit(this.contracts.usdc, "Approval")
                .withArgs(user.address, kratosxContractAddress, value);

            expect(await this.contracts.usdc.allowance(this.accounts.user1.address, kratosxContractAddress)).to.be.equal(value);

            if (this.valueChecks) {
                expect(await this.contracts.usdc.allowance(user.address, kratosxContractAddress)).to.be.equal(value);
            }
        }

        approveDeposit = async (user) => {
            if (this.valueChecks) {
                this.validationData = await this.getInitialValidationData();
            }

            await expect(this.contracts.kratosx.approveDeposit(user.address, LockPeriod.SixMonths))
                .to.emit(this.contracts.kratosx, "DepositApproved");
                    // .withArgs(user.address, undefined);


            if (this.valueChecks) {
                const deposits = await this.contracts.kratosx.getUsedSlots();

                expect(await this.contracts.usdc.balanceOf(this.accounts.user1.address))
                    .to.be.equal(BigInt(this.validationData.initialBalance) - BigInt(SlotPrice));

                expect((await this.contracts.kratosx.getAvailableSlotCount())).to.be.equal(this.validationData.initialAvailableSlotCount - 1);
                expect(deposits.length).to.be.equal(this.validationData.initialDeposits.length + 1);
            }
        }

        approveDepositRegularUser = async (user, signer) => {

            if (this.valueChecks) {
                this.validationData = await this.getInitialValidationData();
            }

            const contract = await this.contracts.kratosx.connect(signer);

            await expect(contract.approveDeposit(user.address, LockPeriod.SixMonths))
                .to.revertedWith("Ownable: caller is not the owner");

            if (this.valueChecks) {
                const deposits = await this.contracts.kratosx.getUsedSlots();

                expect(await this.contracts.usdc.balanceOf(this.accounts.user1.address))
                    .to.be.equal(BigInt(this.validationData.initialBalance));

                expect((await this.contracts.kratosx.getAvailableSlotCount())).to.be.equal(this.validationData.initialAvailableSlotCount);
                expect(deposits.length).to.be.equal(this.validationData.initialDeposits.length);
            }
        }

        rejectDeposit = async (user) => {
            if (this.valueChecks) {
                this.validationData = await this.getInitialValidationData();
            }

            await expect(this.contracts.kratosx.rejectDeposit(user.address))
                .to.emit(this.contracts.kratosx, "DepositRejected")
                    .withArgs(user.address);

            if (this.valueChecks) {
                const deposits = await this.contracts.kratosx.getUsedSlots();

                expect(await this.contracts.usdc.balanceOf(user.address))
                    .to.be.equal(BigInt(this.validationData.initialBalance));

                expect((await this.contracts.kratosx.getAvailableSlotCount())).to.be.equal(this.validationData.initialAvailableSlotCount);
                expect(deposits.length).to.be.equal(this.validationData.initialDeposits.length);
            }
        }

        rejectDepositRegularUser = async (user, signer) => {
            if (this.valueChecks) {
                this.validationData = await this.getInitialValidationData();
            }

            const contract = await this.contracts.kratosx.connect(signer);

            await expect(contract.rejectDeposit(user.address))
                    .to.revertedWith("Ownable: caller is not the owner");

            if (this.valueChecks) {
                const deposits = await this.contracts.kratosx.getUsedSlots();

                expect(await this.contracts.usdc.balanceOf(user.address))
                    .to.be.equal(BigInt(this.validationData.initialBalance));

                expect((await this.contracts.kratosx.getAvailableSlotCount())).to.be.equal(this.validationData.initialAvailableSlotCount);
                expect(deposits.length).to.be.equal(this.validationData.initialDeposits.length);
            }
        }

        /////////////////////////////////////////////////////

        metaMakeDeposit = async (amount, useRegularUser = false) => {
            const kratosxContractAddress = await this.contracts.kratosx.getAddress();
            const expectedCount = Number(amount / SlotPrice);
            const validationData: ValidationData = await this.getInitialValidationData()

            expect(validationData.initialAvailableSlotCount).to.be.equal(100);
            expect(validationData.initialDeposits.length).to.be.equal(0);
            expect(validationData.initialBalance).to.be.equal(wad(1000000));

            await this.requestDeposit(this.accounts.user1, amount);

            let slotId = 0;
            while(await this.contracts.usdc.allowance(this.accounts.user1.address, kratosxContractAddress) >= SlotPrice) {
                ++slotId;
                if (useRegularUser) {
                    await this.approveDepositRegularUser(this.accounts.user1, this.accounts.user1);
                    return;
                } else {
                    await this.approveDeposit(this.accounts.user1)
                }
            }

            expect(slotId).to.be.equal(expectedCount);

            expect(await this.contracts.usdc.balanceOf(this.accounts.user1.address))
                .to.be.equal(validationData.initialBalance - expectedCount * SlotPrice);

            expect((await this.contracts.kratosx.getAvailableSlotCount())).to.be.equal(100 - expectedCount);
            const deposits = await this.contracts.kratosx.getUsedSlots();
            expect(deposits.length).to.be.equal(expectedCount);

        }

        metaRejectDeposit = async (amount, useRegularUser = false) => {
            const validationData: ValidationData = await this.getInitialValidationData()

            expect(validationData.initialAvailableSlotCount).to.be.equal(100);
            expect(validationData.initialDeposits.length).to.be.equal(0);
            expect(validationData.initialBalance).to.be.equal(wad(1000000));

            await this.requestDeposit(this.accounts.user1, amount);

            if (useRegularUser) {
                await this.rejectDepositRegularUser(this.accounts.user1, this.accounts.user1);
            } else {
                await this.rejectDeposit(this.accounts.user1);
            }

            expect(await this.contracts.usdc.balanceOf(this.accounts.user1.address))
                .to.be.equal(BigInt(validationData.initialBalance));

            expect((await this.contracts.kratosx.getAvailableSlotCount())).to.be.equal(validationData.initialAvailableSlotCount);
            const deposits = await this.contracts.kratosx.getUsedSlots();
            expect(deposits.length).to.be.equal(validationData.initialDeposits.length);
        }
    }



    describe("Requesting slots", () => {

        it("Request the first slot", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);
        });

        it("Request 2 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(2 * SlotPrice);
        });


        it("Request 10 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(10 * SlotPrice);
        });

        it("Request 100 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(100 * SlotPrice);
        });

        it("Request 101 slots", async () => {
            try {

                const { contracts, accounts, storage } = await loadFixture(initEnvironment);
                const helpers = new Helpers(contracts, accounts);
                await helpers.metaMakeDeposit(101 * SlotPrice);
                expect(false).to.be.true;
            } catch(e) {
                expect(e.message).to.be.equal("VM Exception while processing transaction: reverted with reason string 'No slots available.'")
            }
        });

        it("Approve slot with a regular user", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(1 * SlotPrice, true);
        });

    });

    describe("Reject slots", () => {
        it("Reject requested slot with regular user", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaRejectDeposit(1 * SlotPrice, true);
        })

        it("Reject requested slot", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaRejectDeposit(1 * SlotPrice);
        })

        it("Reject all requested slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaRejectDeposit(10 * SlotPrice);
        })
        it("Reject part of requested slots")
    });

    describe("Requesting withdrawal", () => {

        async function depositAndRequestWithdraw(days) {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), SlotPrice);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, LockPeriod.SixMonths))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            await timeWarpDays(days);

            days += 7;

            if (days > 1826) {
                days = 1826;
            }

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.emit(contracts.kratosx, "WithdrawRequested")
                    .withArgs(1, calculateFullValue(days, true, false));
        }

        it("Request withdrawal without a deposit", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.be.revertedWithCustomError(contracts.kratosx, "DepositNotFound")
                    .withArgs(1);
        });

        it("Request withdrawal right after deposit", async () => {
            await depositAndRequestWithdraw(0);
        });


        it("Request withdrawal 1 day after deposit", async () => {
            await depositAndRequestWithdraw(1);
        });

        it("Request withdrawal 7 days after deposit", async () => {
            await depositAndRequestWithdraw(7);
        });

        it("Request withdrawal near 6 months", async () => {
            const limit = 180;
            await depositAndRequestWithdraw(limit - 8);
            await depositAndRequestWithdraw(limit - 7);
            await depositAndRequestWithdraw(limit - 6);
            await depositAndRequestWithdraw(limit - 1);
            await depositAndRequestWithdraw(limit);
            await depositAndRequestWithdraw(limit + 1);
        });

        it("Request withdrawal near 1 year", async () => {
            const limit = 365;
            await depositAndRequestWithdraw(limit - 8);
            await depositAndRequestWithdraw(limit - 7);
            await depositAndRequestWithdraw(limit - 6);
            await depositAndRequestWithdraw(limit - 1);
            await depositAndRequestWithdraw(limit);
            await depositAndRequestWithdraw(limit + 1);
        });

        it("Request withdrawal near 2 years", async () => {
            const limit = 730;
            await depositAndRequestWithdraw(limit - 8);
            await depositAndRequestWithdraw(limit - 7);
            await depositAndRequestWithdraw(limit - 6);
            await depositAndRequestWithdraw(limit - 1);
            await depositAndRequestWithdraw(limit);
            await depositAndRequestWithdraw(limit + 1);
        });

        it("Request withdrawal near 3 years", async () => {
            const limit = 1095;
            await depositAndRequestWithdraw(limit - 8);
            await depositAndRequestWithdraw(limit - 7);
            await depositAndRequestWithdraw(limit - 6);
            await depositAndRequestWithdraw(limit - 1);
            await depositAndRequestWithdraw(limit);
            await depositAndRequestWithdraw(limit + 1);
        });

        it("Request withdrawal near 4 years", async () => {
            const limit = 1460;
            await depositAndRequestWithdraw(limit - 8);
            await depositAndRequestWithdraw(limit - 7);
            await depositAndRequestWithdraw(limit - 6);
            await depositAndRequestWithdraw(limit - 1);
            await depositAndRequestWithdraw(limit);
            await depositAndRequestWithdraw(limit + 1);
        });

        it("Request withdrawal near 5 years", async () => {
            const limit = 1825;
            await depositAndRequestWithdraw(limit - 8);
            await depositAndRequestWithdraw(limit - 7);
            await depositAndRequestWithdraw(limit - 6);
            await depositAndRequestWithdraw(limit - 1);
            await depositAndRequestWithdraw(limit);
            await depositAndRequestWithdraw(limit + 1);
            await depositAndRequestWithdraw(limit + 2);
            await depositAndRequestWithdraw(limit + 3);
        });

    });

    describe("Deposit and withdrawal", () => {
        it("Execute withdraw without a request", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const user1InitialBalance = parseInt(await contracts.usdc.balanceOf(accounts.user1.address));
            const kratosxInitialBalance = parseInt(await contracts.usdc.balanceOf(accounts.kratosx.address));

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), SlotPrice);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, LockPeriod.SixMonths))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            expect(await contracts.usdc.balanceOf(accounts.user1.address)).to.be.equal(wad(995000));
            expect(await contracts.usdc.balanceOf(accounts.kratosx.address)).to.be.equal(wad(10005000));

            await timeWarpDays(1300);

            const calcYield = calculateYield(1300, true, false);

            const usdc_kratosx = await contracts.usdc.connect(accounts.kratosx);
            await usdc_kratosx.approve(await contracts.kratosx.getAddress(), SlotPrice + calcYield);


            await contracts.kratosx.executeWithdraw(1);


            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(user1InitialBalance + calcYield);
            expect(await contracts.usdc.balanceOf(accounts.kratosx.address))
                .to.be.equal(kratosxInitialBalance - calcYield);
        });

        it("Execute a single deposit and withdraw")
        it("Execute a single deposit and withdraw before the 7 days of cool down ")
        it("Execute several withdrawals (not all) from user")
        it("Execute all withdrawals")
        it("Execute withdrawal with a regular user")
    });

    describe("Extending the locking period", () => {
        it("Extend the locking period to an invalid id", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);

            await expect(contracts.kratosx.extendLockPeriod(123, LockPeriod.FiveYears))
                .to.revertedWithCustomError(contracts.kratosx, "DepositNotFound")
                .withArgs(123);
            });

        it("Extend the locking period to six months", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);

            await expect(contracts.kratosx.extendLockPeriod(1, LockPeriod.SixMonths))
                .to.revertedWith("Can not set the locking period with this value.")
        });

        it("Extend the locking period with bonus", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);

            const initialSlots = await helpers.getUsedSlots();
            expect(initialSlots.length).to.be.equal(1);
            expect(initialSlots[0].id).to.be.equal(1);
            expect(initialSlots[0].lockingPeriod).to.be.equal(LockPeriod.SixMonths);
            expect(initialSlots[0].hasExtendPeriodBonus).to.be.false;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.OneYear);

            const finalSlots = await helpers.getUsedSlots();
            expect(finalSlots[0].lockingPeriod).to.be.equal(LockPeriod.OneYear);
            expect(finalSlots[0].hasExtendPeriodBonus).to.be.true;
        });

        it("Extend the locking period to a lower period", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);

            const initialSlots = await helpers.getUsedSlots();
            expect(initialSlots.length).to.be.equal(1);
            expect(initialSlots[0].id).to.be.equal(1);
            expect(initialSlots[0].lockingPeriod).to.be.equal(LockPeriod.SixMonths);
            expect(initialSlots[0].hasExtendPeriodBonus).to.be.false;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.FourYears);

            const finalSlots = await helpers.getUsedSlots();
            expect(finalSlots[0].lockingPeriod).to.be.equal(LockPeriod.FourYears);
            expect(finalSlots[0].hasExtendPeriodBonus).to.be.true;

            await expect(contracts.kratosx.extendLockPeriod(1, LockPeriod.OneYear))
                .to.revertedWith("Can only increase the locking period.");
        });

        it("Extend the locking period more then once", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);

            let depositSlots = await helpers.getUsedSlots();
            expect(depositSlots.length).to.be.equal(1);
            expect(depositSlots[0].id).to.be.equal(1);
            expect(depositSlots[0].lockingPeriod).to.be.equal(LockPeriod.SixMonths);
            expect(depositSlots[0].hasExtendPeriodBonus).to.be.false;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.OneYear);

            depositSlots = await helpers.getUsedSlots();
            expect(depositSlots[0].lockingPeriod).to.be.equal(LockPeriod.OneYear);
            expect(depositSlots[0].hasExtendPeriodBonus).to.be.true;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.TwoYears);

            depositSlots = await helpers.getUsedSlots();
            expect(depositSlots[0].lockingPeriod).to.be.equal(LockPeriod.TwoYears);
            expect(depositSlots[0].hasExtendPeriodBonus).to.be.true;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.ThreeYears);

            depositSlots = await helpers.getUsedSlots();
            expect(depositSlots[0].lockingPeriod).to.be.equal(LockPeriod.ThreeYears);
            expect(depositSlots[0].hasExtendPeriodBonus).to.be.true;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.FourYears);

            depositSlots = await helpers.getUsedSlots();
            expect(depositSlots[0].lockingPeriod).to.be.equal(LockPeriod.FourYears);
            expect(depositSlots[0].hasExtendPeriodBonus).to.be.true;

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.FiveYears);

            depositSlots = await helpers.getUsedSlots();
            expect(depositSlots[0].lockingPeriod).to.be.equal(LockPeriod.FiveYears);
            expect(depositSlots[0].hasExtendPeriodBonus).to.be.true;
        });

        it("Extend the locking period without bonus", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const helpers = new Helpers(contracts, accounts);
            await helpers.metaMakeDeposit(SlotPrice);

            const initialSlots = await helpers.getUsedSlots();
            expect(initialSlots.length).to.be.equal(1);
            expect(initialSlots[0].id).to.be.equal(1);
            expect(initialSlots[0].lockingPeriod).to.be.equal(LockPeriod.SixMonths);
            expect(initialSlots[0].hasExtendPeriodBonus).to.be.false;

            helpers.timeWarpDays(1000);

            await contracts.kratosx.extendLockPeriod(1, LockPeriod.OneYear);

            const finalSlots = await helpers.getUsedSlots();
            expect(finalSlots[0].lockingPeriod).to.be.equal(LockPeriod.OneYear);
            expect(finalSlots[0].hasExtendPeriodBonus).to.be.false;
        });

        it("Extend the locking period extension bonus limit")
    });

    describe("Full functionality", () => {
        it("Test the happy path")
        it("Happy path with locking period extension")
        it("Happy path with automatic withdrawal")
    });

});
