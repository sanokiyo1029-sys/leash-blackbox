// Writes the compiled ABI + bytecode to ../shared/LeashAnchor.json so the
// Python backend and the standalone verifier do not need Node at runtime.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  await hre.run("compile");
  const artifact = await hre.artifacts.readArtifact("LeashAnchor");
  const out = {
    contractName: artifact.contractName,
    solcVersion: hre.config.solidity.compilers[0].version,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  };
  const target = path.join(__dirname, "..", "..", "shared", "LeashAnchor.json");
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), target)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
