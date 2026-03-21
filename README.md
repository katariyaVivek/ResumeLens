# ResumeLens — AI Resume Screening Chatbot

An AI-powered resume screening chatbot using RAG and RAG Fusion to match job descriptions against a resume database and answer recruiter queries in natural language.

## Architecture

- **Frontend**: Next.js 14 (App Router, TypeScript) → Vercel
- **Backend**: FastAPI (Python) → Render.com
- **Vector store**: Pinecone or Qdrant Cloud (384-dim `all-MiniLM-L6-v2` embeddings)
- **LLM**: BYOK (Bring Your Own Key) — supports OpenAI, Groq, Anthropic, Ollama, or any OpenAI-compatible API
- **Auth + DB**: Supabase
- **File storage**: Cloudflare R2

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Chat Input   │  │ Settings     │  │ Upload Resumes   │  │
│  │ + RAG Toggle │  │ API Key/URL  │  │ CSV URL or File  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         └────────────┬────┴────────────────────┘            │
│                      │ HTTP/SSE                             │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    RENDER.COM (Backend)                      │
│                                                              │
│  FastAPI ─┬─ /api/chat/stream    ──► LLM (user's key)       │
│           ├─ /api/ingest         ──► Embed ──► Vector Store │
│           ├─ /api/ingest/upload  ──► Embed ──► Vector Store │
│           ├─ /api/models         ──► Provider's /models API │
│           └─ /api/auth           ──► Supabase JWT           │
│                                                              │
└──────────┬──────────────────┬───────────────────────────────┘
           │                  │
     ┌─────┴─────┐    ┌──────┴──────┐
     │ Pinecone  │    │  Supabase   │
     │  (vectors)│    │  (Auth+DB)  │
     └───────────┘    └─────────────┘
```

### Ingest Pipeline

```
CSV File (URL or upload)
        │
        ▼
┌───────────────┐
│  Read CSV     │  pandas reads content + id columns
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Chunk Text   │  RecursiveCharacterTextSplitter
│  1024 chars   │  chunk_size=1024, overlap=500
│  500 overlap  │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Embed Chunks │  sentence-transformers/all-MiniLM-L6-v2
│  → 384-dim    │  each chunk → 384-dimensional vector
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Upsert to    │  Pinecone / Qdrant
│  Vector Store │  index: resumelens-resumes
│  (id, vector, │  metadata: {resume_id, chunk_index, document}
│   metadata)   │
└───────────────┘
```

### Query Pipeline

```
User types a question
        │
        ▼
┌───────────────────┐
│  Query Classifier │  LLM call — not keyword matching
│  (classify once)  │
└────────┬──────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────────┐
│ no_    │ │ retrieve_  │
│retrieve│ │ applicant_ │
│        │ │ jd or _id  │
└───┬────┘ └─────┬──────┘
    │             │
    │        ┌────┴────┐
    │        │  RAG    │
    │        │  MODE?  │
    │        └────┬────┘
    │        ┌────┴────┐
    │        │         │
    │        ▼         ▼
    │   ┌─────────┐ ┌───────────┐
    │   │ Generic │ │   RAG     │
    │   │   RAG   │ │  Fusion   │
    │   └────┬────┘ └─────┬─────┘
    │        │            │
    │   embed query  generate 3-4
    │        │      sub-queries
    │        │            │
    │        │       embed each
    │        │      independently
    │        │            │
    │        │       ┌────┴────┐
    │        │       │ RRF     │  reciprocal rank fusion
    │        │       │ merge   │  score = Σ 1/(60+rank)
    │        │       └────┬────┘
    │        │            │
    └────────┴────────────┘
             │
             ▼
     ┌───────────────┐
     │ Top-k docs    │  resume chunks with metadata
     └───────┬───────┘
             │
             ▼
     ┌───────────────┐
     │  LLM (BYOK)  │  user's API key + model
     │  + context    │  resumes as context for answer
     └───────┬───────┘
             │
             ▼
     ┌───────────────┐
     │  SSE Stream   │  tokens streamed back to frontend
     │  → Frontend   │  rendered with styled markdown
     └───────────────┘
```

## Features

- **BYOK (Bring Your Own Key)** — users enter their own API key, base URL, and pick any model
- **Dynamic model fetching** — available models auto-populate from the provider's API
- **RAG Fusion** — multi-query retrieval with reciprocal rank fusion for better recall
- **Generic RAG** — single similarity search for faster, simpler queries
- **RAG Mode Toggle** — switch between modes per conversation from the header
- **Upload Resumes** — ingest CSV files via URL or direct file upload
- **Browse Candidates** — list all indexed candidates with summaries
- **Function Cards** — filter by job description, skills, experience, ID, or compare candidates
- **Streaming responses** — real-time SSE streaming from backend to frontend
- **Copy responses** — one-click copy on any assistant message
- **Styled responses** — candidate cards with labeled badges (Role, Experience, Skills, Highlights)

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to the respective `.env` files and fill in values:

```bash
# backend/.env
VECTOR_STORE_PROVIDER=pinecone
PINECONE_API_KEY=
PINECONE_INDEX_NAME=resumelens-resumes
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SECRET_KEY=

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

> **Note**: LLM API keys are NOT stored on the server. Users provide their own keys per request via the Settings panel.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/chat` | Non-streaming chat |
| POST | `/api/chat/stream` | Streaming SSE chat |
| POST | `/api/ingest` | Bulk ingest resumes (CSV URL) |
| POST | `/api/ingest/upload` | Upload and ingest CSV file |
| POST | `/api/models` | Fetch available models from provider |
| GET | `/api/auth/me` | Current user info |

## RAG Pipeline

See the **Query Pipeline** diagram above for the full flow. Key stages:

1. **Query classification** — LLM routes to `retrieve_applicant_jd`, `retrieve_applicant_id`, or `no_retrieve`
2. **RAG Fusion** — generates 3-4 sub-queries, retrieves independently, merges via reciprocal rank fusion
3. **Generic RAG** — single similarity search for simpler queries
4. **Response** — LLM generates structured candidate profiles (Role, Experience, Skills, Highlights)

## Color Palette

The frontend uses a warm lavender-rose palette:

| Role | Color |
|------|-------|
| Background | `#f9f5fc` |
| Sidebar | `#2d2438` |
| Accent / Buttons | `#9b6b82` |
| User bubble | `#f2d9e3` |
| Assistant bubble | `#e8dff0` |
| Text | `#3e2f45` |
| Borders | `#cbbfc8` |

## Deployment

See [DEPLOY.md](DEPLOY.md) for step-by-step deployment to Render.com and Vercel.

| Service | Platform |
|---------|----------|
| Backend | Render.com |
| Frontend | Vercel |
| Vector store | Pinecone / Qdrant Cloud |
| Auth + DB | Supabase |

## Project Structure

```
ResumeLens/
├── frontend/          # Next.js 14 chat UI
├── backend/           # FastAPI RAG pipeline
├── Data/              # Resume datasets + evaluation results
├── docs/              # Architecture, API reference
├── Evaluation/        # Metrics and evaluation notebooks
├── Data Preprocessing/ # Data cleaning notebooks
├── render.yaml        # Backend deployment config
└── DEPLOY.md          # Deployment guide
```

See `AGENTS.md` files for detailed code conventions and rules.
