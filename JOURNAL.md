## 2026-05-14

### Attempted
- Loaded root, frontend, and backend AGENTS.md instructions before editing.
- Reviewed the current chat UI, frontend API client, shared types, Tailwind config, and backend chat shape.
- Searched current official docs for Next.js client boundaries, Next font optimization, Tailwind design tokens, and WCAG focus visibility.
- Refactored frontend chat constants, markdown/message helpers, model settings state, and SSE parsing.
- Redesigned the chat surface around a recruiter operations console with named Tailwind palette tokens, responsive layout, and visible focus states.
- Verified with `npm run lint`, `npm run build`, and Playwright browser checks at desktop and mobile sizes.

### Failed (most valuable -- include why)
- `frontend/JOURNAL.md` did not exist at session start despite the root protocol; created this root `JOURNAL.md` entry before ending.
- `next dev` opened port 3000 but did not reach Ready, so browser verification used the successful production build through `next start`.
- The initial browser pass surfaced console noise from automatic backend wake-up calls when local FastAPI was not running; removed implicit page-load/settings wake-ups.
- Mobile settings verification exposed a stacking bug where main content painted over the popover; fixed the app shell z-index layering.

### Worked
- `npm run lint` passed.
- `npm run build` passed.
- Browser verification loaded `/chat` on desktop and mobile with no warnings or errors after the wake-up and layering fixes.
- Settings popover rendered above the mobile content after the z-index fix.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- Local backend was not running on port 8000, so chat request success was not exercised end to end.

## 2026-05-14

### Attempted
- Updated the frontend theme request to warm, soft, and natural.
- Replaced the previous display/body font pairing with JetBrains Mono through `next/font/google`.
- Retuned the existing palette tokens toward cream, clay, sage, and walnut.
- Added a small SVG favicon and metadata icon link to avoid browser favicon 404 noise.
- Re-verified with `npm run lint`, `npm run build`, and mobile browser screenshot/snapshot checks.

### Failed (most valuable -- include why)
- JetBrains Mono widened the input placeholder enough to wrap awkwardly on mobile; shortened the default placeholder to keep the footer clean.

### Worked
- `npm run lint` passed.
- `npm run build` passed.
- Browser verification on `/chat` passed with zero console warnings/errors.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- Local backend was still not running on port 8000, so no live chat request was exercised.

## 2026-05-14

### Attempted
- Investigated the model picker showing "No chat models found" for a Groq key.
- Confirmed the frontend was configured to call `http://localhost:8000` and no backend was initially listening there.
- Checked Groq's current official docs for the OpenAI-compatible models endpoint.
- Updated backend `/api/models` to normalize Groq base URLs, return safe provider error messages, and preserve an optional `error` field in the response model.
- Updated frontend model fetching to return `{ models, error }` instead of collapsing all failures to an empty array.
- Verified through the in-app browser settings panel with a fake Groq key.

### Failed (most valuable -- include why)
- Full `ruff check backend` still reports pre-existing repo-wide E402/F401 issues caused by the mandated `sys.dont_write_bytecode` header pattern and unused imports in untouched files. Targeted checks for the touched backend model route passed with E402 ignored to match the repo header rule.

### Worked
- `npm run lint` passed.
- `npm run build` passed.
- `python -m compileall -q backend` passed.
- `python -m ruff check backend\routers\chat.py backend\models\chat.py --ignore E402` passed.
- Backend `/api/health` returned healthy on port 8000.
- Backend `/api/models` returned `Invalid API Key` for a fake Groq key instead of silently returning no models.
- Browser settings panel displayed `Invalid API Key` instead of `No chat models found`.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- A real Groq API key was not available to verify a successful model list without exposing credentials.

## 2026-05-14

### Attempted
- Investigated messy assistant response rendering shown in the screenshot.
- Identified the root cause as raw SSE `data:` streaming dropping newline chunks, flattening markdown headings and bullets.
- Changed backend chat streaming to JSON-encode every chunk so newline content survives SSE framing.
- Updated the frontend SSE parser to decode JSON chunks while preserving backward compatibility for raw chunks.
- Added markdown preprocessing for candidate headings and field rows.
- Refined assistant markdown rendering so candidate fields render as separated rows instead of inline badges in a text block.
- Tightened LLM system prompts to require headings, bullets, and Best Match text on separate lines.

### Failed (most valuable -- include why)
- Could not verify a live candidate response with the user's real provider key because credentials are BYOK and not visible to the agent.

### Worked
- `npm run lint` passed.
- `npm run build` passed after stopping the running Next production server.
- `python -m compileall -q backend` passed.
- `python -m ruff check backend\routers\chat.py backend\services\llm.py --ignore E402` passed.
- Raw `/api/chat/stream` now emits JSON string chunks, e.g. `data: "..."`, so markdown newlines are preserved.
- Browser loaded `/chat` with zero console warnings/errors.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- Need a real LLM response with the user's provider key to confirm final visual output against live model behavior.

## 2026-05-14

### Attempted
- Cleaned up the frontend chat implementation by extracting model settings, chat config, and message formatting helpers.
- Prepared the warm natural JetBrains Mono theme, structured assistant markdown rendering, Groq model-fetch feedback, and JSON-safe SSE streaming for release.
- Removed local browser automation artifacts and ignored generated TypeScript build-info files.
- Created release branch `codex/polish-resumelens-ui` for the GitHub/Vercel deployment flow.

### Failed (most valuable -- include why)
- The first `npm run build` attempt timed out because stale local Next.js processes were still running. Stopping the workspace-owned frontend server/build process cleared the issue.
- A GitHub push is still pending explicit confirmation because repository instructions require asking before pushes.

### Worked
- `git diff --check` passed.
- `python -m compileall -q backend` passed.
- `python -m ruff check backend\routers\chat.py backend\services\llm.py backend\models\chat.py --ignore E402` passed.
- `npm run lint` passed.
- `npm run build` passed after stopping the stale frontend process.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- Need confirmation before pushing `codex/polish-resumelens-ui` to GitHub and opening the Vercel preview PR.

## 2026-05-15

### Attempted
- Pushed release branch `codex/polish-resumelens-ui` to GitHub after explicit confirmation.
- Created a draft PR against `main` for Vercel preview deployment.

### Failed (most valuable -- include why)
- None.

### Worked
- `git push -u origin codex/polish-resumelens-ui` succeeded.
- Draft PR was created at `https://github.com/katariyaVivek/ResumeLens/pull/1`.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- Wait for Vercel preview/build status on PR #1, then review before merge.

## 2026-05-15

### Attempted
- Investigated failing backend GitHub Actions checks on PR #1.
- Updated backend lint CI to ignore E402 because the repository-mandated `sys.dont_write_bytecode` header intentionally puts imports after executable code.
- Updated backend typecheck CI to run mypy from the repository root against `backend` with explicit package bases.
- Removed unused backend imports and fixed mypy-visible return/type issues in auth, LLM model parsing, ingest, and vector-store helpers.
- Fixed ingest helpers to await the async vector-store upsert call instead of treating the coroutine as a success value.

### Failed (most valuable -- include why)
- The bundled GitHub CI inspection script failed on Windows log decoding, so direct `gh run view --log-failed` was used instead.
- `python -m pytest backend\tests` collected zero tests; pytest exits non-zero when there is no test suite to run.

### Worked
- `python -m ruff check --fix --ignore E402 .` passed from `backend/`.
- `python -m ruff format --check .` passed from `backend/`.
- `python -m mypy backend --explicit-package-bases --ignore-missing-imports` passed from the repository root.
- `python -m compileall -q backend` passed.
- `git diff --check` passed.

### New rules added to AGENTS.md
- None.

### Open questions / blockers
- Need to push the CI-fix commit to `codex/polish-resumelens-ui` so GitHub Actions reruns on PR #1.
