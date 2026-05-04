┌───────────────────────────────────────────────┐
│ LAYER 1: Session & Token Management           │
│-----------------------------------------------│
│ Client → POST /api/sessions                   │
│ Backend → VideoSDK Room Creation API          │
│ Backend → Generates JWT Tokens (candidate/int)│
└───────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────┐
│ LAYER 2: Real-Time Video Layer                │
│-----------------------------------------------│
│ React + VideoSDK SDK                          │
│ Handles: video, audio, participants           │
└───────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────┐
│ LAYER 3: Event Capture Layer                  │
│-----------------------------------------------│
│ Events: join, leave, speaker, meeting-start   │
│ Client → POST /api/events                     │
└───────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────┐
│ LAYER 4: Event Ingestion & Queueing           │
│-----------------------------------------------│
│ API validates event (Zod)                     │
│ Push → BullMQ (Redis)                         │
│ Queues: event | transcription | ai            │
└───────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────┐
│ LAYER 5: Worker Processing Layer              │
│-----------------------------------------------│
│ Event Worker → session state updates          │
│ Transcription Worker → transcript generation  │
│ AI Worker → scoring & report generation       │
└───────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────┐
│ LAYER 6: AI Processing Pipeline               │
│-----------------------------------------------│
│ Gemini (Transcription Simulation)             │
│ Gemini (AI Scoring) + Zod Validation          │
│ Generates structured report                   │
└───────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────┐
│ LAYER 7: Data & Observability Layer           │
│-----------------------------------------------│
│ MongoDB: Sessions, Events, Reports, Jobs      │
│ PipelineJobs (retry, dead-letter tracking)    │
│ GET /api/pipeline/health                      │
└───────────────────────────────────────────────┘