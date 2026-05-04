import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    sessionId: { type: String, index: true },
    organizationId: { type: String, index: true },
    candidateId: String,

    overallScore: Number,
    recommendation: String,

    competencyScores: [
      {
        competency: String,
        score: Number,
        weight: Number,
        evidence: String,
      },
    ],

    summary: String,
    strengths: [String],
    concerns: [String],

    evidenceQuotes: [
      {
        quote: String,
        context: String,
        sentiment: String,
      },
    ],

    generatedAt: String,
  },
  { timestamps: true }
);

reportSchema.index({ organizationId: 1, status: 1 });
reportSchema.index({ sessionId: 1 });

export const Report = mongoose.model("Report", reportSchema);