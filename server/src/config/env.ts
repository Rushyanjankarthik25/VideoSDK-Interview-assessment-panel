import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  PORT: process.env.PORT || "5000",
  MONGO_URI: process.env.MONGO_URI!,
  REDIS_URL: process.env.REDIS_URL!,

  VIDEOSDK_API_KEY: process.env.VIDEOSDK_API_KEY!,
  VIDEOSDK_SECRET: process.env.VIDEOSDK_SECRET!,

  GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
};