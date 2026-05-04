import mongoose from "mongoose";

const pipelineJobSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },

    jobType: {
      type: String,
      enum: [
        "event.process",
        "transcription.process",
        "ai.scoring"
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "dead_letter"],
      default: "queued",
    },

    attempts: { type: Number, default: 0 },
    lastError: String,
  },
  { timestamps: true }
);

export const PipelineJob = mongoose.model("PipelineJob", pipelineJobSchema);