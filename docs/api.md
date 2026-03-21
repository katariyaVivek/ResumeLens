# ResumeLens API Reference

## Base URL

- Development: `http://localhost:8000`
- Production: `https://your-app.onrender.com`

## Authentication

All protected endpoints require a Supabase JWT token in the Authorization header:

```
Authorization: Bearer <supabase-access-token>
```

## Endpoints

### Health Check

**GET** `/api/health`

Check if the API is running.

**Response:**
```json
{
  "status": "healthy"
}
```

---

### Chat

**POST** `/api/chat`

Send a chat message and get a response.

**Request:**
```json
{
  "message": "Find me a Python developer with 5 years experience",
  "rag_mode": "RAG Fusion",
  "model": "gpt-4o-mini",
  "provider": "auto",
  "api_key": "optional-api-key",
  "api_base": "optional-base-url",
  "chat_history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

**Response:**
```json
{
  "response": "Based on my search...",
  "query_type": "retrieve_applicant_jd",
  "retrieved_documents": ["Applicant ID 1\nResume content...", "..."],
  "metadata": {
    "rag_mode": "RAG Fusion",
    "subquestion_list": ["...", "..."],
    "retrieved_docs_with_scores": {...}
  }
}
```

**POST** `/api/chat/stream`

Streaming chat endpoint for real-time responses.

**Request:** Same as `/api/chat`

**Response:** Server-Sent Events (SSE) stream

---

### Ingest

**POST** `/api/ingest`

Ingest resumes from a CSV file.

**Request:**
```json
{
  "file_url": "r2://bucket/resumes.csv",
  "content_column": "Resume",
  "id_column": "ID"
}
```

**Response:**
```json
{
  "success": true,
  "document_count": 100,
  "message": "Successfully ingested 100 resumes",
  "document_ids": ["1", "2", "3", ...]
}
```

---

### Auth

**GET** `/api/auth/me`

Get current authenticated user.

**Response:**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "role": "user",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## Query Types

The system automatically classifies each query into one of three types:

| Type | Description |
|------|-------------|
| `retrieve_applicant_jd` | Job description present; find matching resumes |
| `retrieve_applicant_id` | Specific applicant IDs mentioned; fetch directly |
| `no_retrieve` | General conversation; use chat history only |

## RAG Modes

| Mode | Description |
|------|-------------|
| `Generic RAG` | Single similarity search using the user's query directly |
| `RAG Fusion` | Generates multiple sub-queries, retrieves independently, merges via RRF |

## Error Responses

All errors return a standard format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

Common status codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid or missing token)
- `500` - Internal Server Error
