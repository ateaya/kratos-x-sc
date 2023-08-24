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

describe("MyERC20 basic test", function () {

    // expectedCollectionLengths
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function initEnvironment() {
        const signers = await ethers.getSigners();
        const accounts = {
            kratosx: signers[0],
            usdc: signers[1],
            // user1: ethers.Wallet.createRandom(),
            // user2: ethers.Wallet.createRandom(),
            user1: signers[2],
            user2: signers[3],
        }

        const USDCFactory = (await ethers.getContractFactory('TestUSDC')).connect(accounts.usdc);
        const USDCInstance = await USDCFactory.deploy();
        await USDCInstance.transfer(accounts.user1.address, 10000000);
        await USDCInstance.transfer(accounts.user2.address, 100000);

        expect(await USDCInstance.balanceOf(accounts.user1.address)).to.be.equal(10000000);
        expect(await USDCInstance.balanceOf(accounts.user2.address)).to.be.equal(100000);

        // Contract deployment
        // Token
        const kratosXVaultFactory = (await ethers.getContractFactory("KratosX")).connect(accounts.kratosx);
        const kratoXInstance = await kratosXVaultFactory.deploy(USDCInstance.getAddress(), 500000, 100);
        // const kratoXInstance = await upgrades.deployProxy(kratosXVaultFactory, [500000, 100], { initializer: "initialize" });
        // await kratoXInstance.waitForDeployment();

        // const proxyAddress = await kratoXInstance.erc1967.getImplementationAddress(kratoXInstance);
        const storage = new Storage(kratoXInstance);

        const contracts = {
            kratosx: kratoXInstance,
            usdc: USDCInstance,
        }

        return { contracts, accounts, storage };
    }

    function calculateYield(value, percent, days, earlyAdoptBonus, extendBonus) {
        if(earlyAdoptBonus) {
            percent += 1;
        }
        if(extendBonus && days > 365) {
            percent += 1;
        }
        return BigInt(Math.floor(value * percent * days / (100 * 365)));
    }

    function calculateFullValue(value, percent, days, earlyAdoptBonus, extendBonus) {
        return BigInt(value) + calculateYield(value, percent, days, earlyAdoptBonus, extendBonus);
    }

    describe("Yield calculation", () => {



        it("Calculate yield below 6 months", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const depositValue = 100000;

            async function testInterval(earlyAdoptBonus, extendBonus) {
                let calculatedYield = await contracts.kratosx.calculateYield(depositValue, 0, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, 0, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 30, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, 30, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 60, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, 60, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 90, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, 90, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 179, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, 179, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 180, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 180, earlyAdoptBonus, extendBonus));
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
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 180, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 300, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 300, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 364, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 364, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 365, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 365, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 366, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 366, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 729, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 5, 729, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 730, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 6, 730, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 731, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 6, 731, earlyAdoptBonus, extendBonus));
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
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 6, 1093, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1094, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 6, 1094, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1095, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 7, 1095, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1096, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 7, 1096, earlyAdoptBonus, extendBonus));
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
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 7, 1458, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1459, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 7, 1459, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1460, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 8, 1460, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1461, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 8, 1461, earlyAdoptBonus, extendBonus));
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
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 8, 1823, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1824, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 8, 1824, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1825, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1826, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));
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
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1826, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1827, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 1828, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 5000, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));

                calculatedYield = await contracts.kratosx.calculateYield(depositValue, 10000, earlyAdoptBonus, extendBonus);
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 9, 1825, earlyAdoptBonus, extendBonus));
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
                expect(calculatedYield).to.be.equal(calculateYield(depositValue, 0, 0, earlyAdoptBonus, extendBonus));
            }

            await testInterval(false, false);
            await testInterval(false, true);
            await testInterval(true, false);
            await testInterval(true, true);

            // await expect(contracts.kratosx.calculateYield(depositValue, -1)).to.be.revertedWith("value out-of-bounds");
        });
    });

    describe("Requesting slots", () => {
        // it("Request slot with invalid values", async () => {
        //     const { contracts, accounts, storage } =
        //         await loadFixture(initEnvironment);


        //     // ethers.storageLayout.export();
        //     // await expect(contracts.kratosx.requestDeposit(180)).to.be.revertedWith("Invalid value for 'slots'");
        //     // await expect(contracts.kratosx.requestDeposit(180)).to.be.revertedWith("Not enough slots available");
        //     // await expect(contracts.kratosx.requestDeposit(180)).to.be.revertedWith("Not enough slots available");
        //     // await expect(contracts.kratosx.requestDeposit(256)).to.be.revertedWith("Invalid value for 'slots'");
        //     // await expect(contracts.kratosx.requestDeposit(500)).to.be.revertedWith("Invalid value for 'slots'");
        // });

        // async function allocateNSlots(allocated, n, contracts, account, storage) {
        //     const initialBalance = await contracts.usdc.balanceOf(account);
        //     const initialAvailableSlots = await storage.getAvailableSlots();
        //     const initialUsedSlots = await storage.getUsedSlots();

        //     let count = 0;
        //     let asExpected = false;

        //     await contracts.usdc.on("Approval", async (owner, spender, amount) => {
        //         const allowance = await usdc_user1.allowance(account.address, await contracts.kratosx.getAddress());
        //         if (allowance < 5000) {
        //             if (count == n) {
        //                 asExpected = true;
        //             } else {
        //                 console.log("Request the first slot - not ok [count:", count, "]")
        //             }
        //             return;
        //         }
        //         ++count;

        //         await expect(contracts.kratosx.approveDeposit(owner, 180))
        //             .to.emit(contracts.kratosx, "DepositApproved")
        //                 .withArgs(account.address, count);
        //     });

        //     const usdc_user1 = await contracts.usdc.connect(account);
        //     await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000 * n);

        //     await new Promise(r => setTimeout(r, 1000));

        //     expect(count).to.be.equal(n);
        //     expect(asExpected).to.be.true;

        //     expect(await contracts.usdc.balanceOf(account.address)).to.be.equal(initialBalance - 5000 * n);

        //     expect((await storage.getAvailableSlots()).length).to.be.equal(initialAvailableSlots - n);
        //     expect((await storage.getUsedSlots()).length).to.be.equal(initialUsedSlots + n);

        // }

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

            console.log("user balance after:", await contracts.usdc.balanceOf(accounts.user1.address));
            expect(await contracts.usdc.balanceOf(accounts.user1.address))
                .to.be.equal(BigInt(initialBalance) - BigInt(expectedCount) * BigInt(5000));

            expect((await storage.getAvailableSlots()).length).to.be.equal(0);
            expect((await storage.getUsedSlots()).length).to.be.equal(100);
        });

    });


    describe("Requesting withdrawal", () => {
        async function timeWarpDays(days) {
            await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
        }

        // async depositAndWithdraw(days) {

        // }

        it("Request withdrawal without a deposit", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            await expect(contracts.kratosx.requestWithdrawal(1)).to.be.revertedWith("Item not found in collection");
        });

        it("Request withdrawal right after deposit", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.emit(contracts.kratosx, "WithdrawRequested")
                    .withArgs(1, BigInt(5000));
        });


        it("Request withdrawal 10 seconds after deposit", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            await ethers.provider.send("evm_increaseTime", [10]);

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.emit(contracts.kratosx, "WithdrawRequested")
                    .withArgs(1, BigInt(5000));
        });

        it("Request withdrawal 7 days after deposit", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const depositDays = 7;

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

            await timeWarpDays(depositDays);

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.emit(contracts.kratosx, "WithdrawRequested")
                    .withArgs(1, calculateFullValue(5000, 0, depositDays + 7, true, false));
        });

        it("Request withdrawal 8 days before first 6 months", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            const depositDays = 172;

            const usdc_user1 = await contracts.usdc.connect(accounts.user1);
            await usdc_user1.approve(await contracts.kratosx.getAddress(), 5000);

            await expect(contracts.kratosx.approveDeposit(accounts.user1.address, 180))
                .to.emit(contracts.kratosx, "DepositApproved")
                    .withArgs(accounts.user1.address, 1);

                    await timeWarpDays(depositDays);

            await expect(contracts.kratosx.requestWithdrawal(1))
                .to.emit(contracts.kratosx, "WithdrawRequested")
                    .withArgs(1, calculateFullValue(5000, 0, depositDays + 7, true, false));
        });


    });
});
