# ResumeLens — AI Resume Screening Chatbot

An AI-powered resume screening chatbot using RAG and RAG Fusion to match job descriptions against a resume database and answer recruiter queries in natural language.

## Architecture

- **Frontend**: Next.js 14 (App Router, TypeScript) → Vercel
- **Backend**: FastAPI (Python) → Render.com
- **Vector store**: Pinecone or Qdrant Cloud (384-dim `all-MiniLM-L6-v2` embeddings)
- **LLM**: BYOK (Bring Your Own Key) — supports OpenAI, Groq, Anthropic, Ollama, or any OpenAI-compatible API
- **Auth + DB**: Supabase
- **File storage**: Cloudflare R2

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

1. **Query classification** — routes to `retrieve_applicant_jd`, `retrieve_applicant_id`, or `no_retrieve`
2. **Sub-query generation** (RAG Fusion) — LLM generates 3-4 focused queries
3. **Retrieval** — vector similarity search per sub-query
4. **Reciprocal Rank Fusion** — merge result lists by rank
5. **Response generation** — LLM answers with structured candidate profiles

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
