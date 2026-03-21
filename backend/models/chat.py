import sys

sys.dont_write_bytecode = True

from typing import List, Optional, Dict
from enum import Enum

from pydantic import BaseModel


class RAGMode(str, Enum):
    GENERIC_RAG = "Generic RAG"
    RAG_FUSION = "RAG Fusion"


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    rag_mode: RAGMode = RAGMode.RAG_FUSION
    model: str = "gpt-4o-mini"
    provider: str = "auto"
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    chat_history: Optional[List[Message]] = None


class ChatResponse(BaseModel):
    response: str
    query_type: str
    retrieved_documents: List[str]
    metadata: Optional[Dict] = None


class ModelsRequest(BaseModel):
    api_key: str
    api_base: str


class ModelsResponse(BaseModel):
    models: List[str]
