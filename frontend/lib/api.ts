import { ChatRequest, ChatResponse, IngestRequest, IngestResponse, User, Message } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await import("@/lib/supabase").then(m => m.supabase.auth.getSession());
  
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

export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  const headers = await authHeaders();
  
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `Chat failed: ${res.status}`);
  }
  
  return res.json();
}

export async function streamChatMessage(
  payload: ChatRequest,
  onChunk: (chunk: string) => void
): Promise<void> {
  const headers = await authHeaders();
  
  const res = await fetch(`${BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `Chat failed: ${res.status}`);
  }
  
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  
  if (!reader) {
    throw new Error("No response body");
  }
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        onChunk(data);
      }
    }
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
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `Ingest failed: ${res.status}`);
  }
  
  return res.json();
}

export async function ingestFile(
  file: File,
  contentColumn: string,
  idColumn: string
): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("content_column", contentColumn);
  formData.append("id_column", idColumn);

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
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `Upload failed: ${res.status}`);
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

export async function fetchModels(apiKey: string, apiBase: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE_URL}/api/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, api_base: apiBase }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models ?? [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}
