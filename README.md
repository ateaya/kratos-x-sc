# Kratos-X Vault Smart Contract

This project is part of the Kratos-X Vault and manages vault deposits on the blockchain. The project is part
of a bigger project that consists of this smart-contract, a backend and a frontend.

The user is advised to use the frontend to operate the vault, but it's not required. Here's a description
of the actions taken by the frontend in case of using USDC:

- Approve an amount (defined as 5000) by calling ERC20.approve(<vault owner address>, 5000)
- An event is triggered by this call and the backend will validate if it can finish the deposit or not (this is mainly by checking if the user filled the necessary inputs to generate a written and signed contract)
- The backend will approve and execute the deposit and liquidate it when the locking period comes to an end.
- At any time, the user my request to withdraw the funds, liquidating the deposit. This operation takes 7 days and it's requested by calling the requestWithdrawal(<id if the deposit>).


Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.js
```

