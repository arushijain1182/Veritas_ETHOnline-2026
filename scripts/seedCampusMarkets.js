const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const [deployer, alice, bob, carol, dave, eve] = await ethers.getSigners();
  const usdcUnits = (n) => ethers.parseUnits(n.toString(), 6);

  console.log(`== Seeding Campus Markets on network: ${network.name} ==`);

  // Locate deployment manifest
  let deployment;
  const manifestPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  const frontendManifest = path.join(__dirname, "..", "frontend", "src", "config", "deployment.json");

  if (fs.existsSync(manifestPath)) {
    deployment = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } else if (fs.existsSync(frontendManifest)) {
    deployment = JSON.parse(fs.readFileSync(frontendManifest, "utf-8"));
  } else {
    throw new Error("No deployment.json found. Run deployMarket.js first!");
  }

  const market = await ethers.getContractAt("Market", deployment.market);
  const usdc = await ethers.getContractAt("MockUSDC", deployment.usdc);

  const marketCount = Number(await market.marketCount());
  console.log(`Current on-chain marketCount: ${marketCount}`);

  const now = Math.floor(Date.now() / 1000);
  const day = 86400;

  const campusMarkets = [
    {
      question: "Which hostel will win Women's FGC?",
      options: ["Himadri", "Kailash", "Nalanda", "Dronagiri", "Sahyadri"],
      closeTime: now + day * 5,
      category: "Sports",
    },
    {
      question: "Which hostel will win BRCA Trophy?",
      options: ["Kumaon", "Jwalamukhi", "Shivalik", "Karakoram", "Zanskar"],
      closeTime: now + day * 7,
      category: "Cultural",
    },
    {
      question: "Which hostel will win CAIC Trophy?",
      options: ["Himadri", "Kailash", "Jwalamukhi", "Zanskar", "Aravali"],
      closeTime: now + day * 12,
      category: "Academic",
    },
    {
      question: "Dance Secy will be from which hostel?",
      options: ["Himadri", "Kailash", "Jwalamukhi", "Zanskar", "Aravali"],
      closeTime: now + day * 3,
      category: "Elections",
    },
    {
      question: "Which hostel will win BHM Trophy?",
      options: ["Nilgiri", "Girnar", "Udaigiri", "Satpura", "Vindhyachal"],
      closeTime: now + day * 15,
      category: "Other",
    },
    {
      question: "Which hostel will win General Championship (Sports)?",
      options: ["Zanskar", "Kumaon", "Jwalamukhi", "Aravali", "Karakoram"],
      closeTime: now + day * 9,
      category: "Sports",
    },
    {
      question: "General Secy SAC will be from which hostel?",
      options: ["Kumaon", "Nilgiri", "Girnar", "Shivalik", "Jwalamukhi"],
      closeTime: now + day * 3,
      category: "Elections",
    },
    {
      question: "Which hostel will win Rendezvous Overall Trophy?",
      options: ["Himadri", "Kailash", "Nalanda", "Dronagiri", "Sahyadri"],
      closeTime: now + day * 4,
      category: "Cultural",
    },
  ];

  for (let i = 0; i < campusMarkets.length; i++) {
    const cm = campusMarkets[i];
    console.log(`\nCreating market ${i}: "${cm.question}"`);
    const tx = await market.createMarket(cm.question, cm.options, cm.closeTime, cm.category);
    await tx.wait();
    console.log(`  ✓ Created market: ${cm.question} [${cm.options.join(", ")}]`);
  }

  // Seed sample student bets if MockUSDC supports minting
  if (alice) {
    console.log("\n== Seeding sample student predictions ==");
    const students = [alice, bob, carol, dave, eve].filter(Boolean);
    for (const student of students) {
      await (await usdc.mint(student.address, usdcUnits(10_000))).wait();
      await (await usdc.connect(student).approve(await market.getAddress(), ethers.MaxUint256)).wait();
    }

    // Alice bets 100 on Women's FGC (Himadri)
    await (await market.connect(alice).placeBet(0, 0, usdcUnits(100))).wait();
    // Bob bets 150 on BRCA (Jwalamukhi)
    await (await market.connect(bob).placeBet(1, 1, usdcUnits(150))).wait();
    // Carol bets 75 on CAIC (Zanskar)
    await (await market.connect(carol).placeBet(2, 3, usdcUnits(75))).wait();
    // Dave bets 80 on Dance Secy (Kailash)
    await (await market.connect(dave).placeBet(3, 1, usdcUnits(80))).wait();
    // Eve bets 200 on Sports GC (Zanskar)
    await (await market.connect(eve).placeBet(5, 0, usdcUnits(200))).wait();

    console.log("  ✓ Placed student bets across campus markets.");
  }

  console.log("\n== Campus Markets successfully seeded! ==");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
