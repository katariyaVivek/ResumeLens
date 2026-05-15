import {
  Calendar,
  Hash,
  List,
  Scale,
  Search,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { RAGMode } from "@/types";

export interface ProviderPreset {
  label: string;
  baseUrl: string;
}

export interface ChatFunction {
  id: "jd" | "skills" | "experience" | "id" | "compare" | "list" | "upload";
  icon: LucideIcon;
  label: string;
  description: string;
  placeholder: string;
  prefix: string;
  isModal?: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { label: "Custom", baseUrl: "" },
];

export const RAG_MODES: { value: RAGMode; label: string }[] = [
  { value: "RAG Fusion", label: "Fusion" },
  { value: "Generic RAG", label: "Generic" },
];

export const FUNCTIONS: ChatFunction[] = [
  {
    id: "jd",
    icon: Search,
    label: "Match JD",
    description: "Rank resumes against a pasted job description",
    placeholder: "Paste job description here...",
    prefix: "Find resumes matching this job description:",
  },
  {
    id: "skills",
    icon: Wrench,
    label: "Skill Filter",
    description: "Surface candidates by stack, tools, and domain",
    placeholder: "e.g. Python, Django, AWS",
    prefix: "Find candidates with these skills:",
  },
  {
    id: "experience",
    icon: Calendar,
    label: "Experience",
    description: "Filter by seniority, tenure, or project depth",
    placeholder: "e.g. 5+ years in backend development",
    prefix: "Find candidates with this experience:",
  },
  {
    id: "id",
    icon: Hash,
    label: "Candidate ID",
    description: "Pull the indexed profile for a known applicant",
    placeholder: "e.g. 123",
    prefix: "Get details for candidate ID:",
  },
  {
    id: "compare",
    icon: Scale,
    label: "Compare",
    description: "Evaluate candidates side by side",
    placeholder: "e.g. 123 vs 456 vs 789",
    prefix: "Compare these candidates:",
  },
  {
    id: "list",
    icon: List,
    label: "Browse Index",
    description: "Review indexed candidates with concise summaries",
    placeholder: "",
    prefix: "List all available candidates with a brief summary of each.",
  },
  {
    id: "upload",
    icon: Upload,
    label: "Ingest CSV",
    description: "Add a resume dataset to the retrieval index",
    placeholder: "",
    prefix: "",
    isModal: true,
  },
];

export const SUGGESTED_PROMPTS = [
  "Find backend engineers with Python, FastAPI, and AWS experience",
  "Shortlist React developers who have built recruiter-facing dashboards",
  "Compare candidates 101, 203, and 445 for a senior data role",
  "Who has production RAG, vector database, and evaluation experience?",
];
