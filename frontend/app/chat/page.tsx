"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { streamChatMessage, ingestDocuments } from "@/lib/api";
import { Message, ChatRequest, RAGMode } from "@/types";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Bot,
  User,
  Menu,
  X,
  Plus,
  Search,
  Wrench,
  Calendar,
  Hash,
  Scale,
  Trash2,
  Upload,
  Copy,
  Check,
  List,
  Zap,
  FileText,
  Key,
  Globe,
  Cpu,
  Eye,
  EyeOff,
  ChevronDown,
  Settings,
  Square,
  Pencil,
} from "lucide-react";

const PROVIDER_PRESETS = [
  { label: "OpenAI", base_url: "https://api.openai.com/v1" },
  { label: "Groq", base_url: "https://api.groq.com/openai/v1" },
  { label: "Anthropic", base_url: "https://api.anthropic.com/v1" },
  { label: "Ollama", base_url: "http://localhost:11434/v1" },
  { label: "Custom", base_url: "" },
];

const RAG_MODES: { value: RAGMode; label: string }[] = [
  { value: "RAG Fusion", label: "RAG Fusion" },
  { value: "Generic RAG", label: "Generic RAG" },
];

const FUNCTIONS = [
  {
    id: "jd",
    icon: Search,
    label: "Find by Job Description",
    description: "Paste a job description to find matching resumes",
    placeholder: "Paste job description here...",
    prefix: "Find resumes matching this job description:",
  },
  {
    id: "skills",
    icon: Wrench,
    label: "Filter by Skills",
    description: "Find candidates with specific skills",
    placeholder: "e.g. Python, Django, AWS",
    prefix: "Find candidates with these skills:",
  },
  {
    id: "experience",
    icon: Calendar,
    label: "Filter by Experience",
    description: "Filter by years of experience",
    placeholder: "e.g. 5+ years in backend development",
    prefix: "Find candidates with this experience:",
  },
  {
    id: "id",
    icon: Hash,
    label: "Lookup by ID",
    description: "Get details for a specific candidate ID",
    placeholder: "e.g. 123",
    prefix: "Get details for candidate ID:",
  },
  {
    id: "compare",
    icon: Scale,
    label: "Compare Candidates",
    description: "Compare multiple candidates side by side",
    placeholder: "e.g. 123 vs 456 vs 789",
    prefix: "Compare these candidates:",
  },
  {
    id: "list",
    icon: List,
    label: "Browse Candidates",
    description: "List all indexed candidates with summaries",
    placeholder: "",
    prefix: "List all available candidates with a brief summary of each.",
  },
  {
    id: "upload",
    icon: Upload,
    label: "Upload Resumes",
    description: "Ingest new resumes into the system",
    placeholder: "",
    prefix: "",
    isModal: true,
  },
];

const SUGGESTED_PROMPTS = [
  "Find Python developers with 5+ years experience",
  "Who has Django and AWS experience?",
  "Best React developers with TypeScript skills",
  "Compare candidates 101, 203, and 445",
];

function preprocessMarkdown(text: string): string {
  return text;
}

const markdownComponents = {
  h2: ({ children }: { children?: React.ReactNode }) => {
    const text = String(children);
    const isBestMatch = text.toLowerCase().includes("best match");
    return (
      <div className={`mt-4 mb-2 px-3 py-2 rounded-lg text-sm font-semibold
        ${isBestMatch
          ? "bg-[#f2d9e3]/40 text-[#9b6b82] border border-[#cbbfc8]"
          : "bg-[#e8dff0]/50 text-[#3e2f45]"
        }`}>
        {isBestMatch ? "⭐ " : "👤 "}{children}
      </div>
    );
  },
  strong: ({ children }: { children?: React.ReactNode }) => {
    const text = String(children);
    const labels = ["Role:", "Experience:", "Skills:", "Highlights:"];
    if (labels.some(l => text.startsWith(l))) {
      const label = labels.find(l => text.startsWith(l)) ?? "";
      const value = text.slice(label.length).trim();
      const colors: Record<string, string> = {
        "Role:": "bg-[#e8dff0] text-[#9b6b82]",
        "Experience:": "bg-[#f2d9e3]/40 text-[#9b6b82]",
        "Skills:": "bg-[#e8dff0]/60 text-[#3e2f45]",
        "Highlights:": "bg-[#f2d9e3]/30 text-[#3e2f45]",
      };
      return (
        <span className="inline-flex items-start gap-1.5 my-0.5">
          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${colors[label] ?? "bg-[#e8dff0] text-[#9b6b82]"}`}>
            {label.replace(":", "")}
          </span>
          <span className="text-[#3e2f45]/80 text-[13px]">{value}</span>
        </span>
      );
    }
    return <strong className="text-[#3e2f45] font-semibold">{children}</strong>;
  },
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="space-y-1 my-1 list-none pl-0">{children}</ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-[13px] leading-relaxed text-[#3e2f45]/80 pl-0">{children}</li>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[13px] leading-relaxed text-[#3e2f45]/80 my-1">{children}</p>
  ),
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="copy-btn" title="Copy response">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

interface UploadModalProps {
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [contentColumn, setContentColumn] = useState("content");
  const [idColumn, setIdColumn] = useState("id");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"url" | "file">("url");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleSubmit = async () => {
    setError("");
    setUploading(true);
    try {
      if (mode === "url") {
        if (!fileUrl.trim()) {
          setError("Please enter a file URL");
          setUploading(false);
          return;
        }
        const res = await ingestDocuments({
          file_url: fileUrl.trim(),
          content_column: contentColumn.trim(),
          id_column: idColumn.trim(),
        });
        onSuccess(res.message);
      } else {
        if (!file) {
          setError("Please select a file");
          setUploading(false);
          return;
        }
        const { ingestFile } = await import("@/lib/api");
        const res = await ingestFile(file, contentColumn.trim(), idColumn.trim());
        onSuccess(res.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="modal-title">Upload Resumes</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#e8dff0] transition-colors">
            <X className="w-4 h-4 text-[#9b6b82]" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="rag-toggle">
          <button
            className={`rag-toggle-btn flex-1 ${mode === "url" ? "active" : ""}`}
            onClick={() => setMode("url")}
          >
            From URL
          </button>
          <button
            className={`rag-toggle-btn flex-1 ${mode === "file" ? "active" : ""}`}
            onClick={() => setMode("file")}
          >
            Upload File
          </button>
        </div>

        {mode === "url" ? (
          <div>
            <label className="modal-label">File URL (CSV or s3:// / r2:// path)</label>
            <input
              type="text"
              className="modal-input"
              placeholder="https://example.com/resumes.csv"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="modal-label">CSV File</label>
            <div
              className={`upload-zone ${dragActive ? "active" : ""}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="upload-input"
                onChange={handleFileSelect}
              />
              <FileText className="w-8 h-8 mx-auto mb-2 text-[#cbbfc8] pointer-events-none" />
              {file ? (
                <p className="text-sm text-[#9b6b82] font-medium pointer-events-none">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-[#3e2f45]/50 pointer-events-none">Drop CSV here or click to browse</p>
                  <p className="text-xs text-[#cbbfc8] mt-1 pointer-events-none">Supports .csv files</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="modal-label">Content Column</label>
            <input
              type="text"
              className="modal-input"
              placeholder="content"
              value={contentColumn}
              onChange={(e) => setContentColumn(e.target.value)}
            />
          </div>
          <div>
            <label className="modal-label">ID Column</label>
            <input
              type="text"
              className="modal-input"
              placeholder="id"
              value={idColumn}
              onChange={(e) => setIdColumn(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
          <button className="modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn-primary flex items-center justify-center gap-2"
            onClick={handleSubmit}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Zap className="w-3.5 h-3.5 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Ingest Resumes
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
  const [activeFunction, setActiveFunction] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ragMode, setRagMode] = useState<RAGMode>("RAG Fusion");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [showKey, setShowKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("OpenAI");
  const [showModels, setShowModels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const modelNameRef = useRef(modelName);

  useEffect(() => { modelNameRef.current = modelName; }, [modelName]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!apiKey || !baseUrl) {
      setFetchedModels([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const { fetchModels: apiFetchModels } = await import("@/lib/api");
        const models = await apiFetchModels(apiKey, baseUrl);
        setFetchedModels(models);
        if (models.length > 0 && !models.includes(modelNameRef.current)) {
          setModelName(models[0]);
        }
      } catch {
        setFetchedModels([]);
      } finally {
        setLoadingModels(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [apiKey, baseUrl]);

  const handleNewChat = () => {
    setMessages([]);
    setActiveFunction(null);
    setInput("");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  };

  const handleFunctionClick = (fn: (typeof FUNCTIONS)[0]) => {
    if (fn.id === "upload") {
      setShowUploadModal(true);
      return;
    }
    setActiveFunction(fn.id);
    setInput(fn.prefix + "\n\n");
    if (inputRef.current) inputRef.current.value = fn.prefix + "\n\n";
    inputRef.current?.focus();
  };

  const handleUploadSuccess = (msg: string) => {
    setShowUploadModal(false);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: msg },
    ]);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = inputRef.current?.value?.trim() ?? "";
    if (!query || isLoading) return;

    const userMessage: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMessage]);
    if (inputRef.current) inputRef.current.value = "";
    setInput("");
    setActiveFunction(null);
    setIsLoading(true);
    setEditingIndex(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const chatHistory = messages
        .filter((m) => m.role !== "system")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const payload: ChatRequest = {
        message: query,
        rag_mode: ragMode,
        model: modelName,
        api_key: apiKey || undefined,
        api_base: baseUrl || undefined,
        chat_history: chatHistory,
      };

      let responseText = "";

      await streamChatMessage(payload, (chunk) => {
        responseText += chunk;
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg.role === "assistant") {
            return [...prev.slice(0, -1), { ...lastMsg, content: responseText }];
          }
          return [...prev, { role: "assistant", content: responseText }];
        });
      }, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
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
    const newMessages = messages.slice(0, editingIndex);
    setMessages(newMessages);
    setEditingIndex(null);
    setEditText("");
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.value = editText.trim();
        setInput(editText.trim());
        handleSubmit();
      }
    }, 50);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditResend();
    }
    if (e.key === "Escape") handleEditCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-[#f9f5fc] overflow-hidden">
      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#2d2438]/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex flex-col
          w-[280px] bg-[#2d2438] text-white
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-[#cbbfc8]/15">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#9b6b82] flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">ResumeLens</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 pt-4">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl
                       bg-white/10 hover:bg-white/15 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Functions */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
          <p className="px-3 mb-2 text-[10px] font-semibold text-[#cbbfc8]/40 uppercase tracking-wider">
            Functions
          </p>
          <div className="space-y-1.5">
            {FUNCTIONS.map((fn) => {
              const Icon = fn.icon;
              return (
                <button
                  key={fn.id}
                  onClick={() => handleFunctionClick(fn)}
                  className={`function-card w-full text-left ${activeFunction === fn.id ? "active" : ""}`}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-[#e8dff0]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/90 leading-snug">{fn.label}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-snug line-clamp-2">{fn.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar footer */}
        <div className="px-3 pb-4 border-t border-[#cbbfc8]/15 pt-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl
                       hover:bg-white/5 transition-colors text-xs text-white/40 hover:text-white/60"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear conversation
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 h-16 border-b border-[#cbbfc8] bg-[#f9f5fc] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-[#e8dff0] transition-colors"
            >
              <Menu className="w-5 h-5 text-[#3e2f45]" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#9b6b82] flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-[#3e2f45]">ResumeLens</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* RAG Mode toggle */}
            <div className="rag-toggle">
              {RAG_MODES.map((mode) => (
                <button
                  key={mode.value}
                  className={`rag-toggle-btn ${ragMode === mode.value ? "active" : ""}`}
                  onClick={() => setRagMode(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {/* Settings button */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl transition-colors
                  ${showSettings ? "bg-[#9b6b82] text-white" : "text-[#9b6b82] hover:bg-[#e8dff0]"}`}
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Settings popover */}
              {showSettings && (
                <div className="absolute right-0 top-full mt-2 w-[300px] bg-[#f9f5fc] rounded-2xl border border-[#cbbfc8] shadow-xl z-50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#3e2f45]">API Settings</p>

                  {/* Provider presets */}
                  <div className="flex flex-wrap gap-1">
                    {PROVIDER_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          setSelectedProvider(p.label);
                          setBaseUrl(p.base_url);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors
                          ${selectedProvider === p.label
                            ? "bg-[#9b6b82] text-white"
                            : "bg-[#e8dff0]/50 text-[#3e2f45]/50 hover:bg-[#e8dff0] hover:text-[#3e2f45]"
                          }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="flex items-center gap-1.5 mb-1 text-[10px] text-[#3e2f45]/50">
                      <Key className="w-3 h-3" />
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full px-3 py-2 pr-8 rounded-xl bg-[#e8dff0]/30 border border-[#cbbfc8]
                                   text-xs text-[#3e2f45] placeholder:text-[#9b6b82]/40
                                   focus:outline-none focus:border-[#9b6b82] transition-colors"
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#cbbfc8] hover:text-[#3e2f45] transition-colors"
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="flex items-center gap-1.5 mb-1 text-[10px] text-[#3e2f45]/50">
                      <Globe className="w-3 h-3" />
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="w-full px-3 py-2 rounded-xl bg-[#e8dff0]/30 border border-[#cbbfc8]
                                 text-xs text-[#3e2f45] placeholder:text-[#9b6b82]/40
                                 focus:outline-none focus:border-[#9b6b82] transition-colors"
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="flex items-center gap-1.5 mb-1 text-[10px] text-[#3e2f45]/50">
                      <Cpu className="w-3 h-3" />
                      Model
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        placeholder="gpt-4o-mini"
                        className="w-full px-3 py-2 pr-7 rounded-xl bg-[#e8dff0]/30 border border-[#cbbfc8]
                                   text-xs text-[#3e2f45] placeholder:text-[#9b6b82]/40
                                   focus:outline-none focus:border-[#9b6b82] transition-colors"
                      />
                      <button
                        onClick={() => setShowModels(!showModels)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#cbbfc8] hover:text-[#3e2f45] transition-colors"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModels ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    {showModels && (
                      <div className="mt-1 rounded-xl bg-[#e8dff0] border border-[#cbbfc8] overflow-hidden max-h-[150px] overflow-y-auto">
                        {loadingModels && (
                          <p className="px-3 py-2 text-[11px] text-[#9b6b82] animate-pulse">Fetching models... (may take 30s if server is waking up)</p>
                        )}
                        {!loadingModels && fetchedModels.length === 0 && (
                          <p className="px-3 py-2 text-[11px] text-[#3e2f45]/40">
                            {apiKey ? "No models found — check key and URL" : "Enter API key to fetch models"}
                          </p>
                        )}
                        {!loadingModels && fetchedModels.map((m) => (
                          <button
                            key={m}
                            onClick={() => { setModelName(m); setShowModels(false); }}
                            className={`w-full px-3 py-1.5 text-[11px] text-left hover:bg-[#f2d9e3]/40 transition-colors
                                      ${modelName === m ? "text-[#9b6b82] font-medium" : "text-[#3e2f45]/60"}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {isLoading && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#9b6b82] animate-pulse" />
                <span className="text-[10px] text-[#9b6b82]">Generating...</span>
              </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {isEmpty ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full px-4 py-12">
              <div className="w-14 h-14 rounded-2xl bg-[#e8dff0] flex items-center justify-center mb-6">
                <Bot className="w-7 h-7 text-[#9b6b82]" />
              </div>
              <h2 className="text-xl font-semibold text-[#3e2f45] mb-1">
                What are you looking for?
              </h2>
              <p className="text-sm text-[#9b6b82] mb-8 text-center max-w-sm">
                Ask about candidates or use the functions on the left to get started
              </p>

              {/* Suggested prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(prompt); if (inputRef.current) inputRef.current.value = prompt; inputRef.current?.focus(); }}
                    className="text-left px-4 py-3 rounded-xl border border-[#cbbfc8]
                               hover:border-[#9b6b82] hover:bg-[#f2d9e3]/25
                               transition-all duration-150 group"
                  >
                    <p className="text-xs text-[#3e2f45]/60 group-hover:text-[#3e2f45] leading-snug">
                      {prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages list */
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {/* Avatar */}
                  <div
                    className={`
                      flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                      ${message.role === "user" ? "bg-[#f2d9e3]" : "bg-[#e8dff0]"}
                    `}
                  >
                    {message.role === "user" ? (
                      <User className="w-4 h-4 text-[#3e2f45]" />
                    ) : (
                      <Bot className="w-4 h-4 text-[#9b6b82]" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    {editingIndex === index ? (
                      /* Edit mode */
                      <div className="msg-bubble msg-bubble-user">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="w-full bg-transparent text-[13px] text-[#3e2f45] resize-none outline-none min-h-[40px]"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleEditResend}
                            className="px-3 py-1 rounded-lg bg-[#9b6b82] text-white text-[11px] font-medium hover:bg-[#875a70] transition-colors"
                          >
                            Resend
                          </button>
                          <button
                            onClick={handleEditCancel}
                            className="px-3 py-1 rounded-lg bg-[#cbbfc8]/30 text-[#3e2f45]/60 text-[11px] font-medium hover:bg-[#cbbfc8]/50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`msg-bubble relative group ${
                          message.role === "user" ? "msg-bubble-user" : "msg-bubble-assistant"
                        }`}
                      >
                        <div className={message.role === "user" ? "" : "prose-sm"}>
                          <ReactMarkdown components={message.role === "assistant" ? markdownComponents : undefined}>
                            {message.content}
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
                            className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[#e8dff0]/50 transition-all cursor-pointer text-[#b2a3a4] hover:text-[#3e2f45]"
                            title="Edit message"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <span className={`text-[10px] text-[#cbbfc8] px-1 ${message.role === "user" ? "text-right" : ""}`}>
                      {formatTime(new Date())}
                    </span>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#e8dff0] flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-[#9b6b82]" />
                  </div>
                  <div className="msg-bubble msg-bubble-assistant">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-[#9b6b82] animate-pulse"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input area */}
        <footer className="px-4 pb-4 pt-2 bg-[#f9f5fc] flex-shrink-0">
          {activeFunction && (
            <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-full bg-[#f2d9e3]/30 border border-[#cbbfc8]
                            flex items-center gap-1.5">
                {(() => {
                  const fn = FUNCTIONS.find((f) => f.id === activeFunction);
                  const Icon = fn?.icon ?? Search;
                  return (
                    <>
                      <Icon className="w-3 h-3 text-[#9b6b82]" />
                      <span className="text-[11px] font-medium text-[#3e2f45]">
                        {fn?.label}
                      </span>
                    </>
                  );
                })()}
                <button
                  onClick={() => setActiveFunction(null)}
                  className="ml-1 text-[#cbbfc8] hover:text-[#3e2f45] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto input-glow transition-shadow duration-150"
          >
            <div className="relative flex items-end rounded-2xl border border-[#cbbfc8]
                          bg-[#e8dff0]/25 hover:bg-white focus-within:bg-white">
              <textarea
                ref={inputRef}
                defaultValue={input}
                onKeyDown={handleKeyDown}
                placeholder="Ask about resumes or select a function..."
                rows={1}
                className="flex-1 px-4 py-3.5 pr-14 bg-transparent text-sm text-[#3e2f45]
                         placeholder:text-[#9b6b82] resize-none outline-none
                         leading-relaxed max-h-40"
                style={{ minHeight: "52px" }}
              />
              <button
                type={isLoading ? "button" : "submit"}
                onClick={isLoading ? handleStop : undefined}
                className={`absolute right-2 bottom-2 w-9 h-9 rounded-xl
                         transition-colors flex items-center justify-center
                         ${isLoading
                           ? "bg-[#f2d9e3] hover:bg-[#d4a0b4] text-[#9b6b82]"
                           : "bg-[#9b6b82] hover:bg-[#875a70] text-white"
                         }`}
              >
                {isLoading ? <Square className="w-3.5 h-3.5" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-[#cbbfc8] mt-1.5 px-1 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </footer>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
