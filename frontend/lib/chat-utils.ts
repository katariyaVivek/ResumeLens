import type { Message } from "@/types";

export function preprocessMarkdown(text: string): string {
  return text
    .replace(/([^\n])(##\s+(?:Candidate|Best Match))/g, "$1\n\n$2")
    .replace(/([^\n])(-\s+\*\*(?:Role|Experience|Skills|Highlights):\*\*)/g, "$1\n$2")
    .replace(
      /^(\s*[-*]\s+)\*\*(Role|Experience|Skills|Highlights):\*\*\s+(.+)$/gm,
      "$1**$2: $3**",
    );
}

export function createMessage(
  role: Message["role"],
  content: string,
): Message {
  return {
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function formatMessageTime(createdAt?: string): string {
  const timestamp = createdAt ? new Date(createdAt) : new Date();

  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  return timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toChatHistory(messages: Message[]): Message[] {
  return messages
    .filter((message) => message.role !== "system")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}
