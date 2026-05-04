# VideoSDK Interview Pipeline Architecture

## 1. System Overview

This system is an event-driven interview intelligence platform that processes video interview signals into structured hiring insights.

Pipeline Flow:

Frontend (VideoSDK) → Event Ingestion → Queue (BullMQ) → Workers → MongoDB → AI Scoring → Report

---

## 2. Architecture Layers

### Layer 1: Session Management
- Creates VideoSDK rooms
- Generates role-based JWT tokens
- Maintains session lifecycle
- Ensures tenant isolation via organizationId

---

### Layer 2: Real-Time Video Room
- Built using @videosdk.live/react-sdk
- Supports multi-participant interviews
- Implements:
  - Audio/video controls
  - Screen sharing
  - Active speaker detection

---

### Layer 3: Event-Driven Pipeline
- All client events are pushed to backend
- Events include:
  - participant-joined
  - meeting-started
  - speaker-changed
  - meeting-ended

Pipeline:
Event → Queue → Worker → State Machine

---

### Layer 4: Transcription Layer
- Fetches VideoSDK recording
- Uses Gemini-based simulation (for demo)
- Produces structured transcript with:
  - speaker mapping
  - timestamps
  - confidence

---

### Layer 5: AI Scoring Pipeline
- Uses Gemini LLM
- Input:
  - transcript
  - job context
  - competency rubric

Features:
- Structured prompt design
- Zod schema validation
- Retry on validation failure
- Hallucination prevention

---

### Layer 6: Storage Design

Collections:
- sessions
- events
- transcripts
- reports
- pipeline_jobs

Key features:
- organizationId for tenant isolation
- idempotency keys for events
- indexed queries

---

### Layer 7: Observability

Pipeline Health API:
GET /api/pipeline/health

Returns:
- queue depth
- job success/failure rates
- average processing time
- dead-letter jobs

---

## 3. Event Pipeline Design

Event Flow:

Client → /api/events → Queue → Worker → DB

Features:
- Idempotency (prevents duplicates)
- Retry with exponential backoff
- Dead-letter handling

---

## 4. Scaling Strategy

For 1000 concurrent interviews:

- Each interview generates ~20 events
- Total: 20,000 events

Scaling approach:
- Horizontal worker scaling
- Redis queue distribution
- Stateless workers

---

## 5. Failure Modes

| Failure | Handling |
|--------|---------|
| Worker crash | Job retry |
| AI failure | Retry + validation |
| Duplicate events | Idempotency key |
| Missing transcript | Session marked FAILED |

---

## 6. Tradeoffs

- Used simulated transcription instead of Whisper
- Chose MongoDB for flexibility over relational DB
- Used BullMQ for simplicity over Kafka

---

## 7. Data Model

All collections linked via sessionId.

No embedding to ensure scalability.

---

## 8. Conclusion

This system is designed for:
- scalability
- fault tolerance
- observability

It demonstrates production-level pipeline engineering beyond a simple video application.