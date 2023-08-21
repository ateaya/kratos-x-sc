// To run this test
// npx hardhat test
import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { assert } from "console";
import { ethers, upgrades } from "hardhat";
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
    async getWaitingSlots() {
        return this.convertDepositDataArray(await this.contract.getWaitingSlots());
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
            kratosx_owner: signers[0],
            usdc_owner: signers[1],
            user1: signers[2],
            user2: signers[3],
        }

        const USDCFactory = await ethers.getContractFactory('TestUSDC');
        const USDCInstance = await USDCFactory.deploy();
        await USDCInstance.transfer(accounts.user1.address, 100000);
        await USDCInstance.transfer(accounts.user2.address, 100000);

        const user1Balance = await USDCInstance.balanceOf(accounts.user1.address);
        const user2Balance = await USDCInstance.balanceOf(accounts.user2.address);
        expect(user1Balance).to.be.equal(100000);
        expect(user2Balance).to.be.equal(100000);

        // Contract deployment
        // Token
        const kratosXVaultFactory = await ethers.getContractFactory("KratosX");
        const kratoXInstance = await kratosXVaultFactory.deploy(USDCInstance.target, 500000, 100);
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

    describe("Yield calculation", () => {

        function calculateYield(value, percent, days, earlyAdoptBonus, extendBonus) {
            if(earlyAdoptBonus) {
                percent += 1;
            }
            if(extendBonus && days > 365) {
                percent += 1;
            }
            return Math.floor(value * percent * days / (100 * 365));
        }

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
                expect(calculatedYield).to.be.equal(Math.floor(calculateYield(depositValue, 5, 180, earlyAdoptBonus, extendBonus)));
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

    describe("Request a slot", () => {
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

        it("Request the first slot", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);
            expect((await storage.getAvailableSlots()).length).to.be.equal(100);
            expect((await storage.getWaitingSlots()).length).to.be.equal(0);
            expect((await storage.getUsedSlots()).length).to.be.equal(0);

            await expect(contracts.kratosx.requestDeposit(180))    // , { from: user1.address }
                .to.emit(contracts.kratosx, "DepositRequested")
                .withArgs(1, accounts.kratosx_owner.address);

            expect((await storage.getAvailableSlots()).length).to.be.equal(99);
            expect((await storage.getWaitingSlots()).length).to.be.equal(1);
            expect((await storage.getUsedSlots()).length).to.be.equal(0);
            // TODO: check if the slot was allocated to the user
        });

        it("Request over the amount of available slots", async () => {
            const { contracts, accounts, storage } = await loadFixture(initEnvironment);

            for (let index = 0; index < 100; ++index) {
                await contracts.kratosx.requestDeposit(180);
            }

            await expect(contracts.kratosx.requestDeposit(180)).to.be.revertedWith("Not enough slots available");
            // TODO: check if the slot was allocated to the user
        });

        it("Request a lot of slots", async () => {
            const { contracts, accounts, storage } =
                await loadFixture(initEnvironment);

            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            await contracts.kratosx.requestDeposit(180);
            // TODO: check if the slots were allocated to the user
        });

    });

});
