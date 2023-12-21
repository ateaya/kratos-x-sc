// To run this test
// npx hardhat test
import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
const helpers = require("@nomicfoundation/hardhat-network-helpers");
import "@nomicfoundation/hardhat-chai-matchers";


interface AccountCollection {
    deployer: ethers.HardhatEthersSigner;
    admin: ethers.HardhatEthersSigner;
    operator: ethers.HardhatEthersSigner;
    user: ethers.HardhatEthersSigner;
}


describe("AteayaWhitelist basic testing", function () {

    // expectedCollectionLengths
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function initEnvironment() {
        const signers = await ethers.getSigners();
        const accounts: AccountCollection = {
            deployer: signers[0],
            admin: signers[1],
            operator: signers[2],
            user: signers[3],
        }

        // Contract deployment
        const factory = (await ethers.getContractFactory("AteayaWhitelist")).connect(accounts.deployer);
        const instance = await factory.deploy(accounts.admin, accounts.operator);

        return { instance, accounts };
    }

    describe("Pause the contract", () => {
        it("Call functions that require the contract to be running");
        it("Call functions that are ok even when paused");
    });

    describe("Call contract functions you're not supposed to call", () => {
        it("Call owner functions with another user");
    });


    describe("Update Whitelist", () => {

        it("Initially any user is not whitelisted", async () => {
            const { instance, accounts } = await loadFixture(initEnvironment);

            expect(await instance.isWhitelisted(accounts.user.address))
                .to.be.equal(false);
        });

        it("Whitelist a user", async () => {
            const { instance, accounts } = await loadFixture(initEnvironment);

            const operator = await instance.connect(accounts.operator);
            await operator.update(accounts.user.address, true);
            expect(await instance.isWhitelisted(accounts.user.address))
                .to.be.equal(true);
        });

        it("Admin cannot whitelist a user", async () => {
            const { instance, accounts } = await loadFixture(initEnvironment);

            const admin = await instance.connect(accounts.admin);
            await expect(admin.update(accounts.user.address, true))
                .to.be.revertedWithCustomError(instance, "AccessControlUnauthorizedAccount");
            expect(await instance.isWhitelisted(accounts.user.address))
                .to.be.equal(false);
        });

        it("A regular user cannot whitelist another user", async () => {
            const { instance, accounts } = await loadFixture(initEnvironment);

            const admin = await instance.connect(accounts.user);
            await expect(admin.update(accounts.admin.address, true))
                .to.be.revertedWithCustomError(instance, "AccessControlUnauthorizedAccount");
            expect(await instance.isWhitelisted(accounts.admin.address))
                .to.be.equal(false);
        });

        it("A regular user cannot whitelist himself", async () => {
            const { instance, accounts } = await loadFixture(initEnvironment);

            const admin = await instance.connect(accounts.user);
            await expect(admin.update(accounts.user.address, true))
                .to.be.revertedWithCustomError(instance, "AccessControlUnauthorizedAccount");
            expect(await instance.isWhitelisted(accounts.user.address))
                .to.be.equal(false);
        });

    });

});
