# ResumeLens Code Style Guide

This document outlines the coding conventions for the ResumeLens project.

## Python (Backend)

### File Header

Every Python file must start with:

```python
import sys
sys.dont_write_bytecode = True
```

### Import Order (enforced by ruff)

```python
# 1. Standard library
import sys
from pathlib import Path
from typing import Optional, List, AsyncGenerator

# 2. Third-party
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import litellm

# 3. Local
from backend.services.rag import RAGService
from backend.models.chat import ChatRequest
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `RAGService`, `ChatRequest` |
| Functions | snake_case | `retrieve_docs`, `ingest_resume` |
| Constants | SCREAMING_SNAKE_CASE | `RAG_K_THRESHOLD`, `EMBEDDING_MODEL` |
| Private methods | underscore prefix | `_reciprocal_rank_fusion` |
| Instance variables | snake_case | `self.vector_store`, `self.meta_data` |

### Typing

- Return types required on all functions
- Use `Optional[X]` not `X | None` for compatibility
- Use `List`, `Dict`, `Tuple` from `typing` — not bare `list`, `dict`, `tuple`

### Route Handlers

- All handlers must be `async def`
- All inputs must be typed Pydantic v2 models — never `dict` or raw `Body()`
- All responses must be typed Pydantic v2 models or `StreamingResponse`

### Error Handling

- Use `HTTPException` for all API-level errors with meaningful `detail`
- Use specific exception types in try/except — never bare `except:`
- Log errors with `logging.exception()` — includes full traceback

## TypeScript (Frontend)

### File Structure

```
frontend/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── ui/                # Shared primitives (Button, Input)
│   └── layout/             # Navbar, Sidebar, PageShell
├── lib/                    # Utilities and API clients
├── hooks/                  # Custom React hooks
└── types/                  # TypeScript type definitions
```

### Component Rules

- All components are React Server Components by default
- Add `"use client"` only when needed for event handlers, hooks, or browser APIs
- Keep `"use client"` components as leaf nodes
- Never fetch data in client components — fetch in server components

### Naming

| Type | Convention | Example |
|------|------------|---------|
| Component files | PascalCase.tsx | `ChatWindow.tsx`, `ResumeCard.tsx` |
| Hook files | camelCase.ts | `useChat.ts`, `useAuth.ts` |
| Utility files | camelCase.ts | `formatDate.ts`, `parseResume.ts` |
| Pages | page.tsx | Always named `page.tsx` |
| Layouts | layout.tsx | Always named `layout.tsx` |

### Props

Every component must have an explicitly typed props interface:

```typescript
interface ResumeCardProps {
  id: string;
  name: string;
  uploadedAt: string;
  score?: number;
}

export function ResumeCard({ id, name, uploadedAt, score = 0 }: ResumeCardProps) {
  // ...
}
```

### API Calls

All fetch calls must go through `lib/api.ts`:

```typescript
// lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  return res.json();
}
```

### Styling

- Use Tailwind utility classes for all styling
- No inline `style={{}}` for static values
- Mobile-first responsive design
- Default classes target mobile, `md:` and `lg:` for larger screens

### TypeScript

- Strict mode on — never disable it
- No `any`. Use `unknown` and narrow it
- All shared types live in `types/index.ts`

## Git Conventions

### Commit Messages

- Use present tense: "Add feature" not "Added feature"
- Keep the first line under 72 characters
- Reference issues when applicable

### Branch Naming

- `feature/` for new features
- `fix/` for bug fixes
- `refactor/` for code refactoring

## Testing

### Python

- Use pytest with pytest-asyncio for async tests
- Mock all external services
- Name tests descriptively

### TypeScript

- Use Jest + React Testing Library
- Test component behavior, not implementation details

## CI/CD

- All commits must pass lint and type check
- All tests must pass before merge
- Deploys trigger automatically on push to main
