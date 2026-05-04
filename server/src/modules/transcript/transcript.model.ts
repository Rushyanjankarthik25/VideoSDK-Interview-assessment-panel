import mongoose from "mongoose";

const transcriptSegmentSchema = new mongoose.Schema({
  speaker: {
    participantId: String,
    name: String,
    role: { type: String, enum: ["interviewer", "candidate"] },
  },
  startTime: Number,
  endTime: Number,
  text: String,
  confidence: Number,
});

const transcriptSchema = new mongoose.Schema(
  {
    sessionId: { type: String, index: true },
    organizationId: { type: String, index: true },

    status: {
      type: String,
      enum: ["processing", "completed", "failed", "partial"],
      default: "processing",
      index: true,
    },

    segments: [transcriptSegmentSchema],

    metadata: {
      totalDuration: Number,
      speakerCount: Number,
      wordCount: Number,
      processedAt: String,
    },
  },
  { timestamps: true }
);

// 🔥 Required indexes
transcriptSchema.index({ organizationId: 1, status: 1 });
transcriptSchema.index({ sessionId: 1 });

export const Transcript = mongoose.model("Transcript", transcriptSchema);