import mongoose from "mongoose";

export interface SessionDoc extends mongoose.Document {
  organizationId: string;
  jobId: string;
  candidateId: string;
  roomId: string;
  status: "CREATED" | "LIVE" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";
  expectedParticipants: { userId: string; role: string; name: string; }[];
  actualParticipants: { 
    userId: string; 
    role: string; 
    joinedAt?: Date; 
    leftAt?: Date, 
    speakCount?: number;
    lastSpoke?: Date; 
  }[];
  transcript?: object;
  report?: object;
  failureReason?: string; 
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },

    jobId: { type: String, required: true },
    candidateId: { type: String, required: true },

    roomId: { type: String, required: true },

    recordingId: { type: String, default: null },

    status: {
      type: String,
      enum: [
        "CREATED",
        "LIVE",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "EXPIRED"
      ],
      default: "CREATED",
      index: true
    },

    expectedParticipants: [
      {
        userId: { type: String, required: true },
        role: { type: String, required: true },
        name: { type: String, required: true }
      }
    ],

    actualParticipants: [
      {
        userId: String,
        role: String,
        joinedAt: Date,
        leftAt: Date,
        speakCount: { type: Number, default: 0 },
        lastSpoke: Date,
      }
    ],

    jobContext: {
      title: { type: String, default: "" },
      requiredSkills: { type: [String], default: [] },
      performanceSkills: { type: [String], default: [] },
      experienceLevel: { type: String, default: "mid-level" },
    },
 
    // ✅ Layer 5 spec: competency rubric stored per session
    competencyRubric: [
      {
        name: String,    // e.g. "Technical Problem Solving"
        weight: Number,  // 0.0 – 1.0, all weights must sum to 1.0
        criteria: String,
      },
    ],

    transcript: Object,
    report: Object,

    failureReason: { type: String },

  },
  { timestamps: true }
);

// TTL for expiration (24h)
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

sessionSchema.index({ organizationId: 1, status: 1 });

export const Session = mongoose.model("Session", sessionSchema);