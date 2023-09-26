import { configDotenv } from "dotenv";
import { ethers } from "hardhat";

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

    const kratosXVaultFactory = (await ethers.getContractFactory("KratosX")).connect(accounts.contractSigner);
    const kratosXInstance = await kratosXVaultFactory.deploy(usdcAddress);
    const kratosxVaultAddress = await kratosXInstance.getAddress();

    if(isContinuousIntegration) {
        console.log(kratosxVaultAddress);
    } else {
        console.log("Kratos-X Vault deployed to:", kratosxVaultAddress);
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
