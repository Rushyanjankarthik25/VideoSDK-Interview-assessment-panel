import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Session } from "../modules/session/session.model";

// 👉 You can also create separate models if you have them
// For now we store job + rubric inside session (your current design supports it)

async function seed() {
  await connectDB();

  console.log("🌱 Seeding data...");

  const organizationId = "org_demo_001";

  // 🔥 Clean previous demo data
  await Session.deleteMany({ organizationId });

  const session = await Session.create({
    organizationId,
    jobId: "job_demo_001",
    candidateId: "can_demo_001",
    roomId: "demo-room-001",
    status: "CREATED",

    expectedParticipants: [
      {
        userId: "can_demo_001",
        role: "candidate",
        name: "Arjun Patel",
      },
      {
        userId: "int_demo_001",
        role: "interviewer",
        name: "Meera Krishnan",
      },
      {
        userId: "int_demo_002",
        role: "interviewer",
        name: "Ravi Sharma",
      },
    ],

    actualParticipants: [],

    // 🔥 Inject Job Context (used by AI worker)
    jobContext: {
      title: "Senior Backend Engineer",
      requiredSkills: [
        "Node.js",
        "TypeScript",
        "MongoDB",
        "Redis",
        "System Design",
      ],
      performanceSkills: [
        "Problem Solving",
        "Communication",
        "Code Quality",
      ],
      experienceLevel: "Senior",
    },

    // 🔥 Inject Rubric (VERY IMPORTANT for scoring)
    competencyRubric: [
      {
        name: "Technical Problem Solving",
        weight: 0.3,
        criteria:
          "Can the candidate break down complex problems and provide efficient solutions?",
      },
      {
        name: "System Design Thinking",
        weight: 0.25,
        criteria:
          "Ability to design scalable and fault-tolerant systems",
      },
      {
        name: "Code Quality & Practices",
        weight: 0.2,
        criteria:
          "Clean, maintainable and testable code",
      },
      {
        name: "Communication & Clarity",
        weight: 0.15,
        criteria:
          "Ability to explain clearly",
      },
      {
        name: "Domain Knowledge",
        weight: 0.1,
        criteria:
          "Depth in relevant technologies",
      },
    ],
  });

  console.log("✅ Seeded session:", session._id);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});