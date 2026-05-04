import mongoose from "mongoose";

export interface EventDoc extends mongoose.Document {
  sessionId: string;
  organizationId: string;
  eventType: string;
  payload: Record<string, any>;  // ✅ required, no null
  processedAt?: Date;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}


const eventSchema = new mongoose.Schema(
  {
    sessionId: String,
    organizationId: String,
    eventType: String,
    payload: Object,
    idempotencyKey: { type: String, unique: true },
    processedAt: Date
  },
  { timestamps: true }
);

export const Event = mongoose.model("Event", eventSchema);