import { z } from "zod";

export const reportSchema = z.object({
  overallScore: z
    .number()
    .min(0, "overallScore must be ≥ 0")
    .max(100, "overallScore must be ≤ 100"),

  recommendation: z.enum([
    "Strong Hire",
    "Hire",
    "No Hire",
    "Strong No Hire",
  ]),

  summary: z
    .string()
    .min(10, "summary too short — must be a meaningful executive summary"),

  strengths: z
    .array(z.string().min(1))
    .min(3, "at least 3 strengths required")
    .max(5, "at most 5 strengths"),

  concerns: z
    .array(z.string().min(1))
    .max(5, "at most 5 concerns"),

  competencyScores: z
    .array(
      z.object({
        competency: z.string().min(1),
        score: z.number().min(0).max(100),
        weight: z.number().min(0).max(1),
        evidence: z.string().min(1, "evidence must reference specific transcript content"),
      })
    )
    .min(1, "at least one competency score required"),

  evidenceQuotes: z.array(
    z.object({
      quote: z.string().min(1, "quote cannot be empty"),
      context: z.string().min(1),
      sentiment: z.enum(["positive", "negative", "neutral"]),
    })
  ),
}).refine(
  // Verify competency weights sum to approximately 1.0 (±0.05 tolerance)
  (data) => {
    const total = data.competencyScores.reduce((sum, c) => sum + c.weight, 0);
    return Math.abs(total - 1.0) <= 0.05;
  },
  { message: "competencyScores weights must sum to 1.0 (±0.05)" }
);