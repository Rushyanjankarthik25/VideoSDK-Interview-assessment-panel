export type TranscriptSegment = {
  speaker: {
    participantId: string;
    name: string;
    role: "interviewer" | "candidate";
  };
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
};