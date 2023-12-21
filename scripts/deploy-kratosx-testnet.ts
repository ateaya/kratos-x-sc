import { configDotenv } from "dotenv";
import { ethers, artifacts } from "hardhat";
import { writeFileSync } from 'fs';

const fs = require('node:fs');

async function main() {
    const isContinuousIntegration = process.env.npm_config_ci;
    const usdcAddress = configDotenv().parsed?.USDC_CONTRACT_ADDRESS;

    if (usdcAddress === "" || usdcAddress === undefined) {
        console.log("Please install the USDC contract and set the address in .env['USDC_CONTRACT_ADDRESS']");
        return;
    }

    const signers = await ethers.getSigners();
    const accounts = {
        contractSigner: signers[0],
    }

    const contractName = "KratosX"

    const contractFactory = (await ethers.getContractFactory(contractName)).connect(accounts.contractSigner);
    const contractInstance = await contractFactory.deploy(usdcAddress);

    const data = {
        name: contractName,
        dateTime: new Date(),
        address: await contractInstance.getAddress(),
        abi: artifacts.readArtifactSync(contractName).abi
    };

    writeFileSync(`${contractName}.json`, JSON.stringify(data), {
        flag: 'w',
    });

    if(isContinuousIntegration) {
        console.log(data.address);
    } else {
        console.log("Contract '", contractName, "' deployed to:", data.address);
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
