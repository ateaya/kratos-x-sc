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

const SlotPrice = 5000;

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
    async getAt(pointer: int) {
        return await helpers.getStorageAt(this.contract.target, pointer);
    }
    async getInt(pointer: int) {
        return parseInt(await helpers.getStorageAt(this.contract.target, pointer));
    }
    async getBool(pointer: int) {
        return parseInt(await helpers.getStorageAt(this.contract.target, pointer)) == 1;
    }


    async getTotalAmount(): int {
        return this.getInt(1);
    }
    async getSlotCount(): int {
        return this.getInt(2);
    }
    async getSlotValue(): int {
        return this.getInt(3);
    }
    async getEarlyAdoptBonus(): int {
        return this.getInt(4);
    }

}

describe("KratosX basic testing", function () {

    // expectedCollectionLengths
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function initEnvironment() {
        const signers = await ethers.getSigners();
        const accounts = {
            kratosx: signers[0],
            usdc: signers[1],
            user1: signers[2],
            user2: signers[3],
        }

        // Token deployment
        const USDCFactory = (await ethers.getContractFactory('TestUSDC')).connect(accounts.usdc);
        const USDCInstance = await USDCFactory.deploy();
        await USDCInstance.transfer(accounts.kratosx.address, 10000000);
        await USDCInstance.transfer(accounts.user1.address, 10000000);
        await USDCInstance.transfer(accounts.user2.address, 100000);

        expect(await USDCInstance.balanceOf(accounts.kratosx.address)).to.be.equal(10000000);
        expect(await USDCInstance.balanceOf(accounts.user1.address)).to.be.equal(10000000);
        expect(await USDCInstance.balanceOf(accounts.user2.address)).to.be.equal(100000);

        // Contract deployment
        const kratosXVaultFactory = (await ethers.getContractFactory("KratosX")).connect(accounts.kratosx);
        const kratoXInstance = await kratosXVaultFactory.deploy(USDCInstance.getAddress());

        const storage = new Storage(kratoXInstance);

        const contracts = {
            kratosx: kratoXInstance,
            usdc: USDCInstance,
        }

        return { contracts, accounts, storage };
    }

    function calculateYield(days, earlyAdoptBonus, extendBonus) {
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

        return BigInt(Math.floor(SlotPrice * percent * days / (100 * 365)));
    }

    function calculateFullValue(days, earlyAdoptBonus, extendBonus) {
        return BigInt(SlotPrice) + calculateYield(days, earlyAdoptBonus, extendBonus);
    }

    async function timeWarpDays(days) {
        await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
    }


    function calculatePercentage(days) {
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
            const depositValue = 100000;

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

            const depositValue = 100000;
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

            const depositValue = 100000;
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

            const depositValue = 100000;
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

            const depositValue = 100000;
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

            const depositValue = 100000;
            let calculatedYield = 0;


            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(0, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(0, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);

            // await expect(contracts.kratosx.calculateYield(-1)).to.be.revertedWith("value out-of-bounds");
        });
    });

    async function makeDeposit(amount) {
        const { contracts, accounts, storage } = await loadFixture(initEnvironment);
        const expectedCount = Number(amount / SlotPrice);
        const initialAvailableSlotCount = await contracts.kratosx.getAvailableSlotCount();
        const initialDeposits = await contracts.kratosx.getUsedSlots();
        const initialBalance = await contracts.usdc.balanceOf(accounts.user1.address);
        const kratosContractAddress = await contracts.kratosx.getAddress();

        expect(initialAvailableSlotCount).to.be.equal(100);
        expect(initialDeposits.length).to.be.equal(0);

        expect(initialBalance).to.be.equal(10000000);

        const usdc_user1 = await contracts.usdc.connect(accounts.user1);
        await expect(usdc_user1.approve(kratosContractAddress, expectedCount * SlotPrice))
            .to.emit(contracts.usdc, "Approval")
            .withArgs(accounts.user1.address, kratosContractAddress, expectedCount * SlotPrice);

        let slotId = 0;
        while(await usdc_user1.allowance(accounts.user1.address, kratosContractAddress) >= SlotPrice) {
            ++slotId;
            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
            .to.emit(contracts.kratosx, "DepositApproved")
                .withArgs(accounts.user1.address, slotId);
        }

        expect(slotId).to.be.equal(expectedCount);

        expect(await contracts.usdc.balanceOf(accounts.user1.address))
            .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(SlotPrice));

        expect((await contracts.kratosx.getAvailableSlotCount())).to.be.equal(100 - expectedCount);
        const deposits = await contracts.kratosx.getUsedSlots();
        expect(deposits.length).to.be.equal(expectedCount);

    }

    describe("Requesting slots", () => {

        it("Request the first slot", async () => {
            await makeDeposit(SlotPrice);
        });

        it("Request 2 slots", async () => {
            await makeDeposit(2 * SlotPrice);
        });


        it("Request 10 slots", async () => {
            await makeDeposit(10 * SlotPrice);
        });

        it("Request 100 slots", async () => {
            await makeDeposit(100 * SlotPrice);
        });

        it("Request 101 slots", async () => {
            try {

                await makeDeposit(101 * SlotPrice);
                expect(false).to.be.true;
            } catch(e) {
                expect(e.message).to.be.equal("VM Exception while processing transaction: reverted with reason string 'No slots available.'")
            }
        });

    });

    describe("Reject slots", () => {
        it("Reject requested slot")
        it("Reject all requested slots")
        it("Reject part of requested slots")
    });

    describe("Requesting withdrawal", () => {


        async function depositAndRequestWithdraw(days) {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            await timeWarpDays(days);

            days += 7

            if (days > 1826) {
                days = 1826
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

            const user1InitialBalance = await contracts.usdc.balanceOf(accounts.user1.address);
            const kratosxInitialBalance = await contracts.usdc.balanceOf(accounts.kratosx.address);

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            expect(await contracts.usdc.balanceOf(accounts.user1.address)).to.be.equal(9995000);
            expect(await contracts.usdc.balanceOf(accounts.kratosx.address)).to.be.equal(10005000);

            await timeWarpDays(1300);

            console.log("kratosx address:", accounts.kratosx.address);
            console.log("user1 address:", accounts.user1.address);

            const usdc_kratosx = await contracts.usdc.connect(accounts.kratosx);
            await usdc_kratosx.approve(await contracts.kratosx.getAddress(), 10000);


            await contracts.kratosx.executeWithdraw(1);

            const calcYield = calculateYield(1300, true, false);

            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(user1InitialBalance + calcYield);
            expect(await contracts.usdc.balanceOf(accounts.kratosx.address))
                .to.be.equal(kratosxInitialBalance - calcYield);
        });
    });

    describe("Full functionality", () => {
        it("Test the happy path")
        it("Happy path with locking period extension")
        it("Happy path with automatic withdrawal")
    });

});
