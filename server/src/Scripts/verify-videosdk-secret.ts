/**
 * Run this on your backend server:
 *   npx ts-node scripts/verify-videosdk-secret.ts
 *   (or compile and run with node)
 *
 * It will tell you EXACTLY what's wrong.
 */

import jwt from "jsonwebtoken";
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.VIDEOSDK_API_KEY!;
const SECRET = process.env.VIDEOSDK_SECRET!;

async function main() {
  console.log("\n=== VideoSDK Secret Verification ===\n");
  console.log("VIDEOSDK_API_KEY:", API_KEY ?? "❌ NOT SET");
  console.log(
    "VIDEOSDK_SECRET: ",
    SECRET ? `${SECRET.slice(0, 6)}...(${SECRET.length} chars)` : "❌ NOT SET"
  );

  if (!API_KEY || !SECRET) {
    console.error("\n❌ One or both env vars are missing. Check your .env file.");
    process.exit(1);
  }

  // 1. Generate a minimal token (no roomId binding — broadest possible scope)
  const token = jwt.sign(
    {
      apikey: API_KEY,
      permissions: ["allow_join"],
      version: 2,
      roles: ["rtc"],
    },
    SECRET,
    { algorithm: "HS256", expiresIn: "5m" }
  );

  console.log("\nGenerated test token:", token);

  // 2. Try to create a room with a crawler-scoped token to validate the key pair
  const crawlerToken = jwt.sign(
    {
      apikey: API_KEY,
      permissions: ["allow_join", "allow_mod"],
      version: 2,
      roles: ["crawler"],
    },
    SECRET,
    { algorithm: "HS256", expiresIn: "5m" }
  );

  try {
    console.log("\n--- Testing crawler token against POST /v2/rooms ---");
    const res = await axios.post(
      "https://api.videosdk.live/v2/rooms",
      {},
      { headers: { Authorization: crawlerToken } }
    );
    console.log("✅ Room created successfully! roomId:", res.data.roomId);
    console.log("✅ Your API key + secret pair is CORRECT.");

    // 3. Now verify the rtc token against init-config for that room
    const rtcToken = jwt.sign(
      {
        apikey: API_KEY,
        permissions: ["allow_join"],
        version: 2,
        roles: ["rtc"],
        roomId: res.data.roomId,
        participantId: "verify-script",
      },
      SECRET,
      { algorithm: "HS256", expiresIn: "5m" }
    );

    console.log("\n--- Testing RTC token against POST /infra/v1/meetings/init-config ---");
    const initRes = await axios.post(
      "https://api.videosdk.live/infra/v1/meetings/init-config",
      { roomId: res.data.roomId },
      { headers: { Authorization: rtcToken } }
    );
    console.log("✅ init-config succeeded:", JSON.stringify(initRes.data).slice(0, 120));

  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    console.error(`\n❌ Request failed with status ${status}:`);
    console.error(JSON.stringify(data, null, 2));

    if (status === 401) {
      console.error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSIS: The secret does not match the API key.

Steps to fix:
  1. Go to https://app.videosdk.live → Dashboard → API Keys
  2. Find the key that starts with: ${API_KEY.slice(0, 8)}...
  3. Copy the SECRET (not the API key) — it is shown only once
  4. Update VIDEOSDK_SECRET in your .env file
  5. Restart your backend server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    }
    process.exit(1);
  }
}

main();