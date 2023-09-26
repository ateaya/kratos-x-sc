import { configDotenv } from "dotenv";
import { ethers } from "hardhat";

async function main() {
    const user1Address = process.env.npm_config_wallet;
    let amount = parseInt(process.env.npm_config_amount || "1") * 1000000;
    const signers = await ethers.getSigners();
    const accounts = {
        contractSigner: signers[0],
    }

    const USDC_ADDRESS = configDotenv().parsed?.USDC_CONTRACT_ADDRESS;
    const USDCFile = require('../artifacts/contracts/TestUSDC.sol/TestUSDC.json');

    const provider = ethers.provider;
    const usdc = new ethers.Contract(USDC_ADDRESS, USDCFile.abi, provider).connect(accounts.contractSigner);

    const usdcName = await usdc.name();
    const usdcSymbol = await usdc.symbol();
    const usdcTotalSupply = await usdc.totalSupply();

    console.log(usdcName, usdcSymbol, usdcTotalSupply);

    await usdc.transfer(user1Address, amount);

    // console.log("USDCToken deployed to:", usdcAddress);
    // console.log(`Please update .env with: USDC_CONTRACT_ADDRESS = "${usdcAddress}"`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
