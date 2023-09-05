import { configDotenv } from "dotenv";
import { ethers } from "hardhat";

async function main() {
    const user1Address = configDotenv().parsed?.USER1_ADDRESS;
    const signers = await ethers.getSigners();
    const accounts = {
        contractSigner: signers[0],
    }

    const USDCFactory = (await ethers.getContractFactory('TestUSDC')).connect(accounts.contractSigner);
    const USDCInstance = await USDCFactory.deploy();
    const usdcAddress = await USDCInstance.getAddress();

    await USDCInstance.transfer(user1Address, 1000000000000);

    console.log("USDCToken deployed to:", usdcAddress);
    console.log(`Please update .env with: USDC_CONTRACT_ADDRESS = "${usdcAddress}"`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
