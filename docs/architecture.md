# ResumeLens Architecture

## System Overview

ResumeLens is a production-grade AI-powered resume screening chatbot that uses RAG (Retrieval-Augmented Generation) and RAG Fusion to match job descriptions against a database of resumes and answer recruiter queries in natural language.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Frontend                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐            │
│  │  Login  │  │  Chat   │  │Dashboard│  │ Analytics   │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬──────┘            │
│       │            │            │               │                    │
│       └────────────┴────────────┴───────────────┘                    │
│                           │                                          │
│                    ┌──────┴──────┐                                   │
│                    │  lib/api.ts │ ← All API calls                   │
│                    └──────┬──────┘                                   │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────────────┐
│                             Backend                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                         FastAPI App                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │ │
│  │  │   Auth   │  │   Chat   │  │  Ingest  │  │   Health     │    │ │
│  │  │  Router  │  │  Router  │  │  Router  │  │   Check      │    │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘    │ │
│  │       │             │             │                              │ │
│  │       └─────────────┴─────────────┘                              │ │
│  │                         │                                         │ │
│  │              ┌──────────┴──────────┐                              │ │
│  │              │     Services       │                              │ │
│  │              │  ┌──────────────┐  │                              │ │
│  │              │  │     RAG      │  │                              │ │
│  │              │  ├──────────────┤  │                              │ │
│  │              │  │  RAG Fusion  │  │                              │ │
│  │              │  ├──────────────┤  │                              │ │
│  │              │  │     LLM      │  │                              │ │
│  │              │  ├──────────────┤  │                              │ │
│  │              │  │   Embeddings │  │                              │ │
│  │              │  ├──────────────┤  │                              │ │
│  │              │  │ Vector Store │  │                              │ │
│  │              │  └──────────────┘  │                              │ │
│  │              └───────────────────┘                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│    Supabase     │ │  Pinecone/  │ │  Cloudflare R2  │
│  PostgreSQL +   │ │   Qdrant    │ │   (Storage)     │
│     Auth        │ │  (Vectors)  │ │                 │
└─────────────────┘ └─────────────┘ └─────────────────┘
```

## Component Descriptions

### Frontend (Next.js 14)
- **App Router**: Uses Next.js 14 App Router for routing
- **Auth**: Supabase Auth via OAuth (GitHub, Google)
- **Chat**: Streaming chat with React Markdown rendering
- **State**: Server components fetch data, client components manage UI state

### Backend (FastAPI)
- **Routers**: Separate routers for auth, chat, and ingest
- **Services**: Modular services for RAG, RAG Fusion, LLM, Embeddings, Vector Store
- **Auth**: JWT validation via Supabase

### RAG Pipeline

1. **Query Classification** (`rag_fusion.py`):
   - `retrieve_applicant_jd` - Job description present; find matching resumes
   - `retrieve_applicant_id` - Specific applicant IDs mentioned; fetch directly
   - `no_retrieve` - General conversation; use chat history only

2. **Generic RAG** (`rag.py`):
   - Single similarity search using user's query
   - Returns top-k documents

3. **RAG Fusion** (`rag_fusion.py`):
   - Generates multiple sub-queries from original query
   - Retrieves independently for each sub-query
   - Merges results via Reciprocal Rank Fusion (RRF)
   - Better recall for complex queries

### Infrastructure

| Service | Purpose | Provider |
|---------|---------|----------|
| PostgreSQL + Auth | Database & Authentication | Supabase |
| Vector Store | Resume embeddings storage | Pinecone / Qdrant |
| File Storage | Resume PDF storage | Cloudflare R2 |
| LLM | Language model inference | Groq / OpenAI / Anthropic |
| Compute | API server | Render.com |
| Hosting | Frontend hosting | Vercel |

## Deployment

- **Backend**: Push to `main` → GitHub Actions → Render deploy
- **Frontend**: Push to `main` → Vercel auto-deploy
- **Render free tier**: Spins down after 15 min idle. First request ~30s cold start.
