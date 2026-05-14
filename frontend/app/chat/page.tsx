"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Key,
  Menu,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";

import { ingestDocuments, ingestFile, streamChatMessage } from "@/lib/api";
import {
  FUNCTIONS,
  PROVIDER_PRESETS,
  RAG_MODES,
  SUGGESTED_PROMPTS,
  type ChatFunction,
} from "@/lib/chat-config";
import {
  createMessage,
  formatMessageTime,
  preprocessMarkdown,
  toChatHistory,
} from "@/lib/chat-utils";
import { useModelSettings } from "@/hooks/useModelSettings";
import type { ChatRequest, Message, RAGMode } from "@/types";

const markdownComponents: Components = {
  h2: ({ children }) => {
    const text = String(children);
    const isBestMatch = text.toLowerCase().includes("best match");

    return (
      <div
        className={`mb-2 mt-5 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
          isBestMatch
            ? "border-brass/50 bg-brass/15 text-ink"
            : "border-line bg-canvas/70 text-ink"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${isBestMatch ? "bg-brass" : "bg-pine"}`} />
        {children}
      </div>
    );
  },
  strong: ({ children }) => {
    const text = String(children);
    const labels = ["Role:", "Experience:", "Skills:", "Highlights:"];
    const label = labels.find((item) => text.startsWith(item));

    if (label) {
      const value = text.slice(label.length).trim();
      const styles: Record<string, string> = {
        "Role:": "bg-sky/10 text-sky",
        "Experience:": "bg-pine/10 text-pine",
        "Skills:": "bg-brass/15 text-ink",
        "Highlights:": "bg-rust/10 text-rust",
      };

      return (
        <span className="flex min-w-0 flex-col gap-1 sm:grid sm:grid-cols-[112px_1fr] sm:items-start">
          <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${styles[label]}`}>
            {label.replace(":", "")}
          </span>
          <span className="min-w-0 text-[13px] leading-relaxed text-ink/80">{value}</span>
        </span>
      );
    }

    return <strong className="font-semibold text-ink">{children}</strong>;
  },
  ul: ({ children }) => (
    <ul className="my-2 space-y-2 pl-0">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="list-none rounded-lg border border-line/70 bg-panel/80 px-3 py-2 text-[13px] leading-relaxed text-ink/80">
      {children}
    </li>
  ),
  p: ({ children }) => (
    <p className="my-2 text-[13px] leading-6 text-ink/80">{children}</p>
  ),
};

interface CopyButtonProps {
  text: string;
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="copy-btn" title="Copy response" type="button">
      {copied ? <Check className="h-3.5 w-3.5 text-pine" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

interface UploadModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"url" | "file">("url");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === "dragenter" || event.type === "dragover");
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) setFile(selectedFile);
  };

  const handleSubmit = async () => {
    setError("");
    setUploading(true);

    try {
      if (mode === "url") {
        if (!fileUrl.trim()) {
          setError("Enter a CSV URL or storage path.");
          return;
        }

        const response = await ingestDocuments({
          file_url: fileUrl.trim(),
          content_column: "content",
          id_column: "id",
        });
        onSuccess(response.message);
        return;
      }

      if (!file) {
        setError("Select a CSV, PDF, or text file.");
        return;
      }

      const response = await ingestFile(file);
      onSuccess(response.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted">Dataset intake</p>
            <h3 className="modal-title">Index resumes</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rag-toggle w-full">
          <button
            className={`rag-toggle-btn flex-1 ${mode === "url" ? "active" : ""}`}
            onClick={() => setMode("url")}
            type="button"
          >
            URL
          </button>
          <button
            className={`rag-toggle-btn flex-1 ${mode === "file" ? "active" : ""}`}
            onClick={() => setMode("file")}
            type="button"
          >
            File
          </button>
        </div>

        {mode === "url" ? (
          <div>
            <label className="modal-label">Source path</label>
            <input
              type="text"
              className="modal-input"
              placeholder="https://example.com/resumes.csv"
              value={fileUrl}
              onChange={(event) => setFileUrl(event.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="modal-label">Resume file</label>
            <div
              className={`upload-zone ${dragActive ? "active" : ""}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,.txt"
                className="upload-input"
                onChange={handleFileSelect}
              />
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted" />
              {file ? (
                <p className="text-sm font-medium text-pine">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-ink/60">Drop file or browse</p>
                  <p className="mt-1 text-xs text-muted">CSV, PDF, or TXT</p>
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rust/20 bg-rust/10 px-3 py-2 text-xs text-rust">{error}</p>
        )}

        <div className="flex gap-2">
          <button className="modal-btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="modal-btn-primary flex items-center justify-center gap-2"
            onClick={handleSubmit}
            disabled={uploading}
            type="button"
          >
            {uploading ? (
              <>
                <Database className="h-3.5 w-3.5 animate-spin" />
                Indexing
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Ingest
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFunction, setActiveFunction] = useState<ChatFunction["id"] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ragMode, setRagMode] = useState<RAGMode>("RAG Fusion");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    modelName,
    setModelName,
    showKey,
    setShowKey,
    selectedProvider,
    selectProvider,
    showModels,
    setShowModels,
    fetchedModels,
    loadingModels,
    modelFetchError,
  } = useModelSettings();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  }, [input]);

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setActiveFunction(null);
    setInput("");
    setEditingIndex(null);
    setEditText("");
    inputRef.current?.focus();
  };

  const handleFunctionClick = (fn: ChatFunction) => {
    if (fn.isModal) {
      setShowUploadModal(true);
      return;
    }

    setActiveFunction(fn.id);
    setInput(`${fn.prefix}\n\n`);
    inputRef.current?.focus();
  };

  const handleUploadSuccess = (message: string) => {
    setShowUploadModal(false);
    setMessages((previous) => [
      ...previous,
      createMessage("assistant", message),
    ]);
  };

  const sendQuery = async (query: string, historySnapshot: Message[]) => {
    if (!query || isLoading) return;

    const userMessage = createMessage("user", query);
    setMessages([...historySnapshot, userMessage]);
    setInput("");
    setActiveFunction(null);
    setIsLoading(true);
    setEditingIndex(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const payload: ChatRequest = {
        message: query,
        rag_mode: ragMode,
        model: modelName,
        api_key: apiKey.trim() || undefined,
        api_base: baseUrl.trim() || undefined,
        chat_history: toChatHistory(historySnapshot),
      };

      let responseText = "";

      await streamChatMessage(
        payload,
        (chunk) => {
          responseText += chunk;
          setMessages((previous) => {
            const lastMessage = previous[previous.length - 1];

            if (lastMessage?.role === "assistant") {
              return [
                ...previous.slice(0, -1),
                { ...lastMessage, content: responseText },
              ];
            }

            return [
              ...previous,
              createMessage("assistant", responseText),
            ];
          });
        },
        abort.signal,
      );
    } catch (err: unknown) {
      if (abort.signal.aborted) return;

      setMessages((previous) => [
        ...previous,
        createMessage(
          "assistant",
          err instanceof Error
            ? `The request failed: ${err.message}`
            : "The request failed. Please retry with the same query.",
        ),
      ]);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    void sendQuery(input.trim(), messages);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleEditStart = (index: number) => {
    setEditingIndex(index);
    setEditText(messages[index].content);
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditText("");
  };

  const handleEditResend = () => {
    if (editingIndex === null || !editText.trim()) return;

    const historySnapshot = messages.slice(0, editingIndex);
    setMessages(historySnapshot);
    setEditingIndex(null);
    setEditText("");
    void sendQuery(editText.trim(), historySnapshot);
  };

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleEditResend();
    }

    if (event.key === "Escape") handleEditCancel();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const activeFunctionConfig = FUNCTIONS.find((fn) => fn.id === activeFunction);
  const activeFunctionIcon = activeFunctionConfig?.icon ?? Search;
  const isEmpty = messages.length === 0;
  const streamingAssistantVisible = isLoading && messages[messages.length - 1]?.role === "assistant";

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[296px] flex-col border-r border-white/10 bg-ink text-white transition-transform duration-200 ease-in-out lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass text-ink">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-base font-semibold">ResumeLens</p>
              <p className="text-[10px] font-medium uppercase text-white/45">Recruiting RAG</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pt-4">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
            type="button"
          >
            <Plus className="h-4 w-4" />
            New search
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-white/40">Workflows</p>
          <div className="space-y-1.5">
            {FUNCTIONS.map((fn) => {
              const Icon = fn.icon;

              return (
                <button
                  key={fn.id}
                  onClick={() => handleFunctionClick(fn)}
                  className={`function-card w-full ${activeFunction === fn.id ? "active" : ""}`}
                  type="button"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Icon className="h-3.5 w-3.5 text-brass" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-snug text-white">{fn.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/45">{fn.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 border-t border-white/10 px-3 pb-4 pt-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-white/70">
              <ShieldCheck className="h-3.5 w-3.5 text-brass" />
              <span className="text-[11px] font-semibold">BYOK session</span>
            </div>
            <p className="mt-1 text-[10px] text-white/40">
              {apiKey ? "Provider key loaded locally" : "No provider key entered"}
            </p>
          </div>
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white/70"
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear conversation
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-16 flex-shrink-0 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-ink transition-colors hover:bg-canvas lg:hidden"
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-semibold text-ink">Candidate workspace</span>
                {isLoading && (
                  <span className="hidden rounded-full bg-pine/10 px-2 py-0.5 text-[10px] font-semibold text-pine sm:inline">
                    Generating
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted">{modelName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <div className="rag-toggle">
                {RAG_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    className={`rag-toggle-btn ${ragMode === mode.value ? "active" : ""}`}
                    onClick={() => setRagMode(mode.value)}
                    type="button"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setShowSettings(!showSettings);
                }}
                className={`rounded-lg p-2 transition-colors ${
                  showSettings ? "bg-ink text-white" : "text-ink hover:bg-canvas"
                }`}
                title="Settings"
                type="button"
              >
                <Settings className="h-4 w-4" />
              </button>

              {showSettings && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] space-y-3 rounded-lg border border-line bg-panel p-4 shadow-panel">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted">Model control</p>
                      <p className="text-sm font-semibold text-ink">API settings</p>
                    </div>
                    <SlidersHorizontal className="h-4 w-4 text-muted" />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {PROVIDER_PRESETS.map((provider) => (
                      <button
                        key={provider.label}
                        onClick={() => selectProvider(provider)}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          selectedProvider === provider.label
                            ? "bg-ink text-white"
                            : "bg-canvas text-muted hover:text-ink"
                        }`}
                        type="button"
                      >
                        {provider.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
                      <Key className="h-3 w-3" />
                      API key
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="sk-..."
                        className="settings-input pr-9"
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
                        title={showKey ? "Hide key" : "Show key"}
                        type="button"
                      >
                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
                      <Globe className="h-3 w-3" />
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="settings-input"
                    />
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
                      <Cpu className="h-3 w-3" />
                      Model
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={modelName}
                        onChange={(event) => setModelName(event.target.value)}
                        placeholder="gpt-4o-mini"
                        className="settings-input pr-9"
                      />
                      <button
                        onClick={() => setShowModels(!showModels)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
                        type="button"
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showModels ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    {showModels && (
                      <div className="mt-1 max-h-[160px] overflow-y-auto rounded-lg border border-line bg-canvas">
                        {loadingModels && (
                          <p className="px-3 py-2 text-[11px] text-muted">Fetching models...</p>
                        )}
                        {!loadingModels && fetchedModels.length === 0 && (
                          <p className="px-3 py-2 text-[11px] text-muted">
                            {apiKey ? modelFetchError || "No chat models found" : "Enter a key to fetch models"}
                          </p>
                        )}
                        {!loadingModels && fetchedModels.map((model) => (
                          <button
                            key={model}
                            onClick={() => {
                              setModelName(model);
                              setShowModels(false);
                              setShowSettings(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-panel ${
                              modelName === model ? "font-semibold text-pine" : "text-ink/65"
                            }`}
                            type="button"
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="workspace-surface relative z-0 flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-4 py-10">
              <div className="max-w-2xl animate-rise-in">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-semibold text-muted shadow-soft-line">
                  <Database className="h-3.5 w-3.5 text-pine" />
                  Indexed resume intelligence
                </div>
                <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                  Shortlist candidates with grounded resume evidence.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                  Run job-description matching, compare applicants, and inspect indexed candidate records from one focused console.
                </p>
              </div>

              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="group rounded-lg border border-line bg-panel p-4 text-left shadow-soft-line transition-all hover:-translate-y-0.5 hover:border-pine/40 hover:shadow-panel"
                    type="button"
                  >
                    <p className="text-xs font-semibold uppercase text-brass">Search prompt</p>
                    <p className="mt-2 text-sm leading-5 text-ink/75 group-hover:text-ink">{prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
              {messages.map((message, index) => (
                <div
                  key={`${message.createdAt ?? index}-${index}`}
                  className={`flex animate-rise-in gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      message.role === "user"
                        ? "bg-pine text-white"
                        : "border border-line bg-panel text-pine"
                    }`}
                  >
                    {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {editingIndex === index ? (
                      <div className="msg-bubble msg-bubble-user">
                        <textarea
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="min-h-[44px] w-full resize-none bg-transparent text-[13px] text-white outline-none placeholder:text-white/60"
                          rows={2}
                          autoFocus
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={handleEditResend}
                            className="rounded-md bg-panel px-3 py-1 text-[11px] font-semibold text-pine transition-colors hover:bg-canvas"
                            type="button"
                          >
                            Resend
                          </button>
                          <button
                            onClick={handleEditCancel}
                            className="rounded-md bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/15 hover:text-white"
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`msg-bubble group relative ${
                          message.role === "user" ? "msg-bubble-user" : "msg-bubble-assistant"
                        }`}
                      >
                        <div>
                          <ReactMarkdown components={message.role === "assistant" ? markdownComponents : undefined}>
                            {preprocessMarkdown(message.content)}
                          </ReactMarkdown>
                        </div>

                        {message.role === "assistant" && message.content && (
                          <div className="absolute -bottom-1 -right-1">
                            <CopyButton text={message.content} />
                          </div>
                        )}

                        {message.role === "user" && (
                          <button
                            onClick={() => handleEditStart(index)}
                            className="absolute -top-1 -right-1 rounded-md bg-panel p-1.5 text-muted opacity-0 shadow-sm transition-all hover:text-ink group-hover:opacity-100"
                            title="Edit message"
                            type="button"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <span className={`px-1 text-[10px] text-muted ${message.role === "user" ? "text-right" : ""}`}>
                      {formatMessageTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && !streamingAssistantVisible && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-pine">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="msg-bubble msg-bubble-assistant">
                    <div className="flex gap-1.5">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="relative z-20 flex-shrink-0 border-t border-line bg-paper/95 px-4 pb-4 pt-3 backdrop-blur">
          {activeFunctionConfig && (
            <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 shadow-soft-line">
                {(() => {
                  const ActiveIcon = activeFunctionIcon;
                  return <ActiveIcon className="h-3 w-3 text-pine" />;
                })()}
                <span className="text-[11px] font-semibold text-ink">{activeFunctionConfig.label}</span>
                <button
                  onClick={() => setActiveFunction(null)}
                  className="ml-1 rounded-full text-muted transition-colors hover:text-ink"
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="input-glow mx-auto max-w-4xl rounded-lg transition-shadow duration-150">
            <div className="relative flex items-end rounded-lg border border-line bg-panel shadow-soft-line transition-colors hover:border-pine/40">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeFunctionConfig?.placeholder || "Search resumes or candidates..."}
                rows={1}
                className="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-4 py-3.5 pr-14 text-sm leading-relaxed text-ink outline-none placeholder:text-muted"
              />
              <button
                type={isLoading ? "button" : "submit"}
                onClick={isLoading ? handleStop : undefined}
                className={`absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isLoading
                    ? "bg-rust/10 text-rust hover:bg-rust/20"
                    : "bg-pine text-white hover:bg-pine-dark"
                }`}
                title={isLoading ? "Stop response" : "Send message"}
              >
                {isLoading ? <Square className="h-3.5 w-3.5" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </footer>
      </div>

      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
