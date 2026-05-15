import type { ChatRequest, ChatResponse, IngestRequest, IngestResponse, ModelFetchResult, User } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await import("@/lib/supabase").then((m) => m.supabase.auth.getSession());

  if (session?.access_token) {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    };
  }

  return {
    "Content-Type": "application/json",
  };
}

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const error = await res.json().catch(() => ({}));

  if (
    typeof error === "object" &&
    error !== null &&
    "detail" in error &&
    typeof error.detail === "string"
  ) {
    return error.detail;
  }

  return fallback;
}

function decodeStreamPayload(data: string): string {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === "string" ? parsed : data;
  } catch {
    return data;
  }
}

function getServerSentEventData(event: string): string {
  return event
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
}

export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  const headers = await authHeaders();

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Chat failed: ${res.status}`));
  }

  return res.json();
}

export async function streamChatMessage(
  payload: ChatRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers = await authHeaders();

  const res = await fetch(`${BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Chat failed: ${res.status}`));
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  if (!reader) {
    throw new Error("No response body");
  }

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      return;
    }

    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const data = getServerSentEventData(event);

      if (!data) continue;
      if (data === "[DONE]") return;
      onChunk(decodeStreamPayload(data));
    }
  }

  const data = getServerSentEventData(buffer);
  if (data && data !== "[DONE]") {
    onChunk(decodeStreamPayload(data));
  }
}

export async function ingestDocuments(payload: IngestRequest): Promise<IngestResponse> {
  const headers = await authHeaders();

  const res = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Ingest failed: ${res.status}`));
  }

  return res.json();
}

export async function ingestFile(
  file: File
): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const supabaseModule = await import("@/lib/supabase");
  const { data: { session } } = await supabaseModule.supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${BASE_URL}/api/ingest/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Upload failed: ${res.status}`));
  }

  return res.json();
}

export async function getCurrentUser(): Promise<User> {
  const headers = await authHeaders();

  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to get user: ${res.status}`);
  }

  return res.json();
}

export async function wakeUp(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/health`, { method: "GET" });
  } catch {}
}

function normalizeApiBase(apiBase: string): string {
  const trimmed = apiBase.trim().replace(/\/+$/, "");

  if (!trimmed) return trimmed;

  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  if (withScheme === "https://api.groq.com") {
    return "https://api.groq.com/openai/v1";
  }

  return withScheme;
}

export async function fetchModels(apiKey: string, apiBase: string): Promise<ModelFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${BASE_URL}/api/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        api_base: normalizeApiBase(apiBase),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) {
      return {
        models: [],
        error: await getErrorMessage(res, `Model fetch failed: ${res.status}`),
      };
    }

    const data = await res.json();
    return {
      models: Array.isArray(data.models) ? data.models : [],
      error: typeof data.error === "string" ? data.error : undefined,
    };
  } catch {
    clearTimeout(timer);
    return {
      models: [],
      error: "Backend is unavailable. Start the backend on port 8000.",
    };
  }
}
