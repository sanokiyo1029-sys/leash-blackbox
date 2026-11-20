// Deploys LeashAnchor to the configured network and prints the address.
// The backend can also deploy by itself (see backend/app/anchor.py); this
// script exists for manual/operator use.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory("LeashAnchor");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction().wait();
  console.log(JSON.stringify({
    address: await contract.getAddress(),
    deployer: deployer.address,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
