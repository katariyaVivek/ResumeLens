export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export type RAGMode = "Generic RAG" | "RAG Fusion";

export interface ChatRequest {
  message: string;
  rag_mode: RAGMode;
  model: string;
  provider?: string;
  api_key?: string;
  api_base?: string;
  chat_history?: Message[];
}

export interface ChatResponse {
  response: string;
  query_type: string;
  retrieved_documents: string[];
  metadata?: Record<string, unknown>;
}

export interface IngestRequest {
  file_url: string;
  content_column?: string;
  id_column?: string;
}

export interface IngestResponse {
  success: boolean;
  document_count: number;
  message: string;
  document_ids?: string[];
}

export interface User {
  id: string;
  email: string;
  role: "admin" | "user" | "viewer";
  created_at?: string;
}
