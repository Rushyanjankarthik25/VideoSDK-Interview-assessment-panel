import { Worker } from "bullmq";
import { ENV } from "../config/env";
import { GoogleGenerativeAI } from "@google/generative-ai"; 
import { Transcript } from "../modules/transcript/transcript.model";
import { Report } from "../modules/report/report.model";
import { Session } from "../modules/session/session.model";
import { PipelineJob } from "../modules/pipeline/pipeline.model";
import { reportSchema } from "../modules/report/report.schema";
import { z } from "zod";

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  generationConfig: { temperature: 0.1 },
}); 

const connection = { url: ENV.REDIS_URL };

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetencyRubric {
  name: string;
  weight: number;
  criteria: string;
}

interface JobContext {
  title: string;
  requiredSkills: string[];
  performanceSkills: string[];
  experienceLevel: string;
}

// ✅ FIX: Proper typed session (LEAN OBJECT)
interface LeanSession {
  _id: string;
  candidateId: string;
  jobContext?: JobContext;
  competencyRubric?: CompetencyRubric[];
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  transcriptText: string,
  jobContext: JobContext,
  rubric: CompetencyRubric[],
  previousError?: string
): string {
  const rubricJson = JSON.stringify(rubric, null, 2);

  const correctionNote = previousError
    ? `\n⚠️ Previous attempt failed validation: ${previousError}\nFix the issues and return valid JSON.\n`
    : "";

  return `You are an expert technical interviewer evaluating a candidate.
${correctionNote}
## Job Context
Title: ${jobContext.title}
Experience Level: ${jobContext.experienceLevel}
Required Skills: ${jobContext.requiredSkills.join(", ")}
Performance Skills: ${jobContext.performanceSkills.join(", ")}

## Competency Rubric
${rubricJson}

## Interview Transcript
${transcriptText}

## Instructions
Analyze the transcript against the job context and rubric.
Return ONLY a JSON object — no markdown, no explanation, no code fences.

The JSON must exactly match this TypeScript interface:
{
  overallScore: number,          // 0-100 weighted average of competency scores
  recommendation: "Strong Hire" | "Hire" | "No Hire" | "Strong No Hire",
  summary: string,               // 2-3 sentence executive summary
  strengths: string[],           // 3-5 bullet points
  concerns: string[],            // 0-5 bullet points
  competencyScores: Array<{
    competency: string,          // must match rubric name exactly
    score: number,               // 0-100
    weight: number,              // copy from rubric
    evidence: string             // specific example from transcript
  }>,
  evidenceQuotes: Array<{
    quote: string,               // MUST be verbatim text from the transcript
    context: string,             // what question/topic this was about
    sentiment: "positive" | "negative" | "neutral"
  }>
}

CRITICAL: Every quote in evidenceQuotes must appear verbatim in the transcript.
Do not invent or paraphrase quotes.`;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

/**
 * Strip markdown code fences that GPT-4o sometimes wraps around JSON.
 * e.g. ```json { ... } ``` → { ... }
 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const aiWorker = new Worker(
  "ai-queue",
  async (job) => {
    const { sessionId, organizationId } = job.data;
    console.log("🤖 AI scoring started:", sessionId);

    // ── Fetch dependencies ────────────────────────────────────────────────
    const [transcript, session] = await Promise.all([
      Transcript.findOne({ sessionId }),
      Session.findById(sessionId).lean<LeanSession>(),
    ]);

    if (!transcript) throw new Error("Transcript missing");
    if (!session) throw new Error("Session missing");

    // ── Guard: do not score empty or failed transcripts ───────────────────
    if (!transcript.segments.length) {
      await Session.findByIdAndUpdate(sessionId, {
        status: "FAILED",
        failureReason: "Empty transcript"
      });
      return;
    }


    const jobRecord = await PipelineJob.findOne({
      sessionId,
      jobType: "ai.scoring",
    }).sort({ createdAt: -1 });

    try {
      if (jobRecord) {
        jobRecord.status = "processing";
        jobRecord.attempts = job.attemptsMade + 1;
        await jobRecord.save();
      }

      // ── Build transcript text ─────────────────────────────────────────
      const transcriptText = transcript.segments
        .map((s) => {
          const role = s.speaker?.role ?? "unknown";
          const name = s.speaker?.name ?? "Speaker";
          return `[${role.toUpperCase()} - ${name}]: ${s.text}`;
        })
        .join("\n");

      // ── Resolve job context + rubric from session ─────────────────────
      // Default rubric if none configured — still produces a meaningful score
      const jobContext: JobContext = session.jobContext ?? {
        title: "Software Engineer",
        requiredSkills: ["problem solving", "communication"],
        performanceSkills: ["technical depth", "collaboration"],
        experienceLevel: "mid-level",
      };

      const rubric: CompetencyRubric[] =
        session.competencyRubric && session.competencyRubric.length > 0
          ? session.competencyRubric
          : [
              {
                name: "Technical Problem Solving",
                weight: 0.4,
                criteria:
                  "Demonstrates structured thinking, debugging skill, and knowledge depth.",
              },
              {
                name: "Communication",
                weight: 0.3,
                criteria:
                  "Articulates ideas clearly, listens well, asks clarifying questions.",
              },
              {
                name: "Culture & Collaboration",
                weight: 0.3,
                criteria:
                  "Shows team orientation, adaptability, and constructive attitude.",
              },
            ];

      // ── LLM call with up to 2 retries (3 total attempts) ─────────────
      // ✅ Fixed: removed the dead first call. The while loop IS the only call.
      // ✅ Fixed: retry count starts at 0, max 3 total (0, 1, 2 = 3 attempts).
      // ✅ Fixed: corrective prompt passed on retry with the previous error.
      let parsed: z.infer<typeof reportSchema> | undefined;
      let lastError = "";
      const MAX_ATTEMPTS = 3;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const prompt = buildPrompt(
            transcriptText,
            jobContext,
            rubric,
            attempt > 0 ? lastError : undefined
          );

           const result = await model.generateContent(prompt);

          const raw = result.response.text();
          if (!raw) throw new Error("Empty LLM response");

          // ✅ Fixed: strip markdown fences before parsing
          const json = extractJson(raw);
          const candidate = JSON.parse(json);

          // ✅ Zod validation — throws ZodError if schema mismatch
          parsed = reportSchema.parse(candidate);
          break; // success — exit loop

        } catch (err: any) {
          lastError = err instanceof z.ZodError
            ? err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
            : err.message;

          console.warn(`⚠️ AI attempt ${attempt + 1} failed: ${lastError}`);

          if (attempt === MAX_ATTEMPTS - 1) {
            throw new Error(`LLM validation failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
          }
        }
      }

      if (!parsed) throw new Error("Parsed report is undefined after retry loop");

      // ── Anti-hallucination check ──────────────────────────────────────
      // ✅ Spec requirement: every evidenceQuote must exist verbatim in transcript
      const hallucinated = (parsed.evidenceQuotes ?? []).filter(
        (q) => !transcriptText.includes(q.quote)
      );
      if (hallucinated.length > 0) {
        throw new Error(
          `Hallucinated quotes detected: "${hallucinated[0].quote.slice(0, 60)}…"`
        );
      }

      // ── Persist report ────────────────────────────────────────────────
      await Report.create({
        ...parsed,
        sessionId,
        organizationId,
        candidateId: session.candidateId,
        generatedAt: new Date().toISOString(),
      });

      // ✅ FIX: update DB instead of session.save()
      await Session.findByIdAndUpdate(sessionId, {
        status: "COMPLETED"
      });

      if (jobRecord) {
        jobRecord.status = "completed";
        await jobRecord.save();
      }

      console.log(
        `✅GEMINI AI scoring complete: score=${parsed.overallScore}, ` +
        `recommendation=${parsed.recommendation}`
      );

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("❌ AI worker error:", message);

      if (jobRecord) {
        jobRecord.lastError = message;
        jobRecord.status =
          job.attemptsMade + 1 >= 3 ? "dead_letter" : "failed";
        await jobRecord.save();
      }

      // ✅ FIX: update DB instead of session.save()
      await Session.findByIdAndUpdate(sessionId, {
        status: "FAILED",
        failureReason: message,
      });
      throw err; // BullMQ handles retry
    }
  },
  { connection }
);