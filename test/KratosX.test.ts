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
const helpers = require("@nomicfoundation/hardhat-network-helpers");


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
                predictedYield: item[3],
                lockingPeriod: item[4],
                hasEarlyAdoptBonus: item[5],
                hasExtendPeriodBonus: item[6],
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
    async getDepositList(pointer: int) {
        const length = await this.getInt(pointer);
        const result: any[] = [];
        for (let index = 0; index < length; ++index) {
            const indexPointer = parseInt(ethers.keccak256("0x" + ("" + pointer).padStart(64, "0"))) + 7 * index;
            const id = await this.getInt(indexPointer);
            result.push({
                id: await this.getInt(indexPointer),
                owner: await this.getAt(indexPointer + 1),
                approveTimestamp: await this.getInt(indexPointer + 2),
                predictedYield: await this.getInt(indexPointer + 3),
                lockingPeriod: await this.getInt(indexPointer + 4),
                hasEarlyAdoptBonus: await this.getBool(indexPointer + 5),
                hasExtendPeriodBonus: await this.getBool(indexPointer + 6),
            });
            // pointer += 7;
        }
        console.log(length);
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
    async getAvailableSlots(): any[] {
        const result = await this.contract.getAvailableSlots();
        return this.convertDepositDataArray(result);
    }
    async getUsedSlots() {
        return this.convertDepositDataArray(await this.contract.getUsedSlots());
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
        const kratoXInstance = await kratosXVaultFactory.deploy(USDCInstance.getAddress(), 500000, 100);

        const storage = new Storage(kratoXInstance);

        const contracts = {
            kratosx: kratoXInstance,
            usdc: USDCInstance,
        }

        return { contracts, accounts, storage };
    }

    function calculateYield(value, days, earlyAdoptBonus, extendBonus) {
        let percent = calculatePercentage(days);

        if(earlyAdoptBonus) {
            percent += 1;
        }

        if(extendBonus && days > 365) {
            percent += 1;
        }

        return BigInt(Math.floor(value * percent * days / (100 * 365)));
    }

    function calculateFullValue(value, days, earlyAdoptBonus, extendBonus) {
        return BigInt(value) + calculateYield(value, days, earlyAdoptBonus, extendBonus);
    }

    async function timeWarpDays(days) {
        await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
    }


    function calculatePercentage(days) {
        if (days < 180) {
            return 0;
        } else if (days < 365) {    //  < 1 year
            return 5;
        } else if (days < 730) {    //  1 years < days > 2 years
            return 5;
        } else if (days < 1095) {   //  2 years < days > 3 years
            return 6;
        } else if (days < 1460) {   //  3 years < days > 4 years
            return 7;
        } else if (days < 1825) {   //  4 years < days > 5 years
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
                let calculatedYield = await contracts.kratosx.calculateYield(depositValue, 0, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 30, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 30, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 60, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 60, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 90, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 90, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 179, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 179, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 180, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 180, earlyAdoptBonus, extendBonus));
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
                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 180, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 180, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 300, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 300, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 364, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 364, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 365, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 365, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 366, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 366, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 729, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 729, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 730, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 730, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 731, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 731, earlyAdoptBonus, extendBonus));
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
                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1093, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1093, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1094, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1094, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1095, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1095, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1096, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1096, earlyAdoptBonus, extendBonus));
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
                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1458, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1458, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1459, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1459, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1460, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1460, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1461, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1461, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);
        });

        it("Calculate yield below 5 years", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const depositValue = 100000;
            let calculatedYield = 0;



            async function testInterval(earlyAdoptBonus, extendBonus) {
                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1823, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1823, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1824, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1824, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1826, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));
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
                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1826, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1827, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1828, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 5000, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 10000, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus));
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
                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 0, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);

            // await expect(contracts.kratosx.calculateYield(depositValue, -1)).to.be.revertedWith("value out-of-bounds");
        });
    });

    describe("Requesting slots", () => {

        it("Request the first slot", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const expectedCount = 1;
            const initialAvailableSlots = await storage.getAvailableSlots();
            const initialUsedSlots = await storage.getUsedSlots();
            const initialBalance = await contracts.usdc.balanceOf(accounts.user1.address);

            expect(initialAvailableSlots.length).to.be.equal(100);
            expect(initialUsedSlots.length).to.be.equal(0);

            expect(initialBalance).to.be.equal(10000000);

            let count = 0;
            let asExpected = false;

            await contracts.usdc.on("Approval", async (owner, spender, amount) => {
                const allowance = await usdc_user1.allowance(accounts.user1.address, await contracts.kratosx.getAddress());

                if (allowance < 5000) {
                    if (count == expectedCount) {
                        asExpected = true;
                    } else {
                        console.log("Request 1 slots - not ok [count:", count, "]")
                    }
                    return;
                }

                ++count;
                await expect(contracts.kratosx.approveDeposit(owner, 180))
                    .to.emit(contracts.kratosx, "DepositApproved")
                        .withArgs(accounts.user1.address, count);

            });

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), expectedCount * 5000);

            await new Promise(r => setTimeout(r, 10000));

            expect(count).to.be.equal(expectedCount);
            expect(asExpected).to.be.true;

            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(5000));

            expect((await storage.getAvailableSlots()).length).to.be.equal(100 - expectedCount);
            expect((await storage.getUsedSlots()).length).to.be.equal(expectedCount);
        });

        it("Request 2 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const expectedCount = 2;
            const initialAvailableSlots = await storage.getAvailableSlots();
            const initialUsedSlots = await storage.getUsedSlots();
            const initialBalance = await contracts.usdc.balanceOf(accounts.user1.address);

            expect(initialAvailableSlots.length).to.be.equal(100);
            expect(initialUsedSlots.length).to.be.equal(0);

            expect(initialBalance).to.be.equal(10000000);

            let count = 0;
            let asExpected = false;

            await contracts.usdc.on("Approval", async (owner, spender, amount) => {
                const allowance = await usdc_user1.allowance(accounts.user1.address, await contracts.kratosx.getAddress());

                if (allowance < 5000) {
                    if (count == expectedCount) {
                        asExpected = true;
                    } else {
                        console.log("Request 2 slots - not ok [count:", count, "]")
                    }
                    return;
                }

                ++count;
                await expect(contracts.kratosx.approveDeposit(owner, 180))
                    .to.emit(contracts.kratosx, "DepositApproved")
                        .withArgs(accounts.user1.address, count);

            });

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), expectedCount * 5000);

            await new Promise(r => setTimeout(r, 10000));

            expect(count).to.be.equal(expectedCount);
            expect(asExpected).to.be.true;

            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(5000));

            expect((await storage.getAvailableSlots()).length).to.be.equal(100 - expectedCount);
            expect((await storage.getUsedSlots()).length).to.be.equal(expectedCount);
        });


        it("Request 10 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const expectedCount = 10;
            const initialAvailableSlots = await storage.getAvailableSlots();
            const initialUsedSlots = await storage.getUsedSlots();
            const initialBalance = await contracts.usdc.balanceOf(accounts.user1.address);

            expect(initialAvailableSlots.length).to.be.equal(100);
            expect(initialUsedSlots.length).to.be.equal(0);

            expect(initialBalance).to.be.equal(10000000);

            let count = 0;
            let asExpected = false;

            await contracts.usdc.on("Approval", async (owner, spender, amount) => {
                const allowance = await usdc_user1.allowance(accounts.user1.address, await contracts.kratosx.getAddress());

                if (allowance < 5000) {
                    if (count == expectedCount) {
                        asExpected = true;
                    } else {
                        console.log("Request 10 slots - not ok [count:", count, "]")
                    }
                    return;
                }

                ++count;
                await expect(contracts.kratosx.approveDeposit(owner, 180))
                    .to.emit(contracts.kratosx, "DepositApproved")
                        .withArgs(accounts.user1.address, count);

            });

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), expectedCount * 5000);

            await new Promise(r => setTimeout(r, 10000));

            expect(count).to.be.equal(expectedCount);
            expect(asExpected).to.be.true;

            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(5000));

            expect((await storage.getAvailableSlots()).length).to.be.equal(100 - expectedCount);
            expect((await storage.getUsedSlots()).length).to.be.equal(expectedCount);
        });

        it("Request 100 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const expectedCount = 100;
            const initialAvailableSlots = await storage.getAvailableSlots();
            const initialUsedSlots = await storage.getUsedSlots();
            const initialBalance = await contracts.usdc.balanceOf(accounts.user1.address);

            expect(initialAvailableSlots.length).to.be.equal(100);
            expect(initialUsedSlots.length).to.be.equal(0);

            expect(initialBalance).to.be.equal(10000000);

            let count = 0;
            let asExpected = false;

            await contracts.usdc.on("Approval", async (owner, spender, amount) => {
                const allowance = await usdc_user1.allowance(accounts.user1.address, await contracts.kratosx.getAddress());

                if (allowance < 5000) {
                    if (count == expectedCount) {
                        asExpected = true;
                    } else {
                        console.log("Request 100 slots - not ok [count:", count, "]")
                    }
                    return;
                }

                ++count;
                await expect(contracts.kratosx.approveDeposit(owner, 180))
                    .to.emit(contracts.kratosx, "DepositApproved")
                        .withArgs(accounts.user1.address, count);

            });

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), expectedCount * 5000);

            await new Promise(r => setTimeout(r, 10000));

            expect(count).to.be.equal(expectedCount);
            expect(asExpected).to.be.true;

            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(5000));

            expect((await storage.getAvailableSlots()).length).to.be.equal(100 - expectedCount);
            expect((await storage.getUsedSlots()).length).to.be.equal(expectedCount);
        });

        it("Request 101 slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const expectedCount = 100;
            const attemptCounts = 101;
            const initialAvailableSlots = await storage.getAvailableSlots();
            const initialUsedSlots = await storage.getUsedSlots();
            const initialBalance = await contracts.usdc.balanceOf(accounts.user1.address);

            expect(initialAvailableSlots.length).to.be.equal(100);
            expect(initialUsedSlots.length).to.be.equal(0);

            expect(initialBalance).to.be.equal(10000000);

            let count = 0;
            let asExpected = false;

            await contracts.usdc.on("Approval", async (owner, spender, amount) => {
                const allowance = await usdc_user1.allowance(accounts.user1.address, await contracts.kratosx.getAddress());

                if (allowance < 5000) {
                    if (count == attemptCounts) {
                        console.log("Request 101 slots - ok");
                        asExpected = true;
                    } else {
                        console.log("Request 101 slots - not ok [count:", count, "]")
                    }
                    return;
                }

                ++count;
                console.log("Request 101 slots - making deposit", count, allowance);
                try {
                    await expect(contracts.kratosx.approveDeposit(owner, 180))
                        .to.emit(contracts.kratosx, "DepositApproved")
                            .withArgs(accounts.user1.address, count);
                } catch(e) {
                    if (count == attemptCounts) {
                        asExpected = true;
                        console.log("Request 101 slots - ok (by exception)");
                        return;
                    }
                    console.log("got an exception when trying to approve a deposit")
                }

            });

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), attemptCounts * 5000);

            await new Promise(r => setTimeout(r, 11000));

            expect(count).to.be.equal(attemptCounts);
            expect(asExpected).to.be.true;

            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(5000));

            expect((await storage.getAvailableSlots()).length).to.be.equal(0);
            expect((await storage.getUsedSlots()).length).to.be.equal(100);
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

            if (days > 1825) {
                days = 1825
            }

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.emit(contracts.kratosx, "WithdrawRequested")
                    .withArgs(1, calculateFullValue(5000, days, true, false));
        }

        it("Request withdrawal without a deposit", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            await expect(contracts.kratosx.requestWithdrawal(1)).to.be.revertedWith("Item not found in collection");
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

            const calcYield = calculateYield(5000, 1300, true, false);

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
