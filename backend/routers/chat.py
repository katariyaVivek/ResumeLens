import sys

sys.dont_write_bytecode = True

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.models.chat import (
    ChatRequest,
    ChatResponse,
    RAGMode,
    ModelsRequest,
    ModelsResponse,
)
from backend.models.user import User
from backend.services.rag import RAGService
from backend.services.rag_fusion import RAGFusionService
from backend.services.vector_store import VectorStoreService
from backend.services.embeddings import EmbeddingsService
from backend.services.llm import LLMService
from backend.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

vector_store = VectorStoreService()
embeddings = EmbeddingsService()


class StreamChatRequest(BaseModel):
    message: str
    rag_mode: RAGMode = RAGMode.RAG_FUSION
    model: str = "gpt-4o-mini"
    provider: str = "auto"
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    chat_history: Optional[List[dict]] = None


def _build_llm(
    request_model: str,
    request_api_key: Optional[str],
    request_provider: str,
    request_api_base: Optional[str],
) -> LLMService:
    if request_provider == "auto" and request_api_base:
        for name, base in {
            "groq": "https://api.groq.com/openai/v1",
            "openai": "https://api.openai.com/v1",
            "anthropic": "https://api.anthropic.com/v1",
        }.items():
            if base in request_api_base:
                request_provider = name
                break
    return LLMService(
        model=request_model,
        api_key=request_api_key,
        provider=request_provider,
        api_base=request_api_base,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    # current_user: User = Depends(get_current_user),  # Temporarily disabled for testing
) -> ChatResponse:
    try:
        llm = _build_llm(
            request.model, request.api_key, request.provider, request.api_base
        )
        rag_fusion = RAGFusionService(vector_store, embeddings, llm)
        rag = RAGService(vector_store, embeddings, llm)

        chat_history = None
        if request.chat_history:
            chat_history = [
                {"role": msg.role, "content": msg.content}
                for msg in request.chat_history
            ]

        query_type = rag_fusion.classify_query(request.message)

        documents = []
        try:
            if request.rag_mode == RAGMode.RAG_FUSION:
                retrieval_result = await rag_fusion.retrieve(
                    query=request.message,
                    query_type=query_type,
                    rag_mode="RAG Fusion",
                )
            else:
                docs = await rag.retrieve(request.message)
                retrieval_result = {
                    "documents": [d["metadata"].get("document", "") for d in docs],
                    "query_type": query_type,
                }
            documents = retrieval_result.get("documents", [])
        except Exception as e:
            logger.warning(f"Vector store error (continuing without docs): {e}")
            documents = []

        response_text = await llm.generate_response(
            query=request.message,
            documents=documents,
            query_type=query_type,
            chat_history=chat_history,
        )

        return ChatResponse(
            response=response_text,
            query_type=query_type,
            retrieved_documents=documents,
            metadata={"rag_mode": request.rag_mode.value},
        )
    except Exception as e:
        logger.exception("Chat error")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def stream_chat(
    request: StreamChatRequest,
    # current_user: User = Depends(get_current_user),  # Temporarily disabled for testing
) -> StreamingResponse:
    try:
        llm = _build_llm(
            request.model, request.api_key, request.provider, request.api_base
        )
        rag_fusion = RAGFusionService(vector_store, embeddings, llm)
        rag = RAGService(vector_store, embeddings, llm)

        chat_history = request.chat_history or []

        query_type = rag_fusion.classify_query(request.message)

        documents = []
        try:
            if request.rag_mode == RAGMode.RAG_FUSION:
                retrieval_result = await rag_fusion.retrieve(
                    query=request.message,
                    query_type=query_type,
                    rag_mode="RAG Fusion",
                )
            else:
                docs = await rag.retrieve(request.message)
                retrieval_result = {
                    "documents": [d["metadata"].get("document", "") for d in docs],
                    "query_type": query_type,
                }
            documents = retrieval_result.get("documents", [])
        except Exception as e:
            logger.warning(f"Vector store error (continuing without docs): {e}")
            documents = []

        async def generate():
            full_response = ""
            try:
                async for chunk in llm.generate_response_stream(
                    query=request.message,
                    documents=documents,
                    query_type=query_type,
                    chat_history=chat_history,
                ):
                    full_response += chunk
                    yield f"data: {chunk}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield f"data: Error: {str(e)}\n\n"
            yield f"data: [DONE]\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.exception("Stream chat error")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models", response_model=ModelsResponse)
async def list_models(request: ModelsRequest):
    """Fetch available chat models from an OpenAI-compatible API."""
    import httpx as _httpx

    NON_CHAT_PATTERNS = (
        "whisper",
        "tts",
        "stt",
        "embed",
        "rerank",
        "prompt-guard",
        "guard",
        "moderation",
        "vision",
        "dall-e",
        "stable-diffusion",
    )

    try:
        async with _httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{request.api_base.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {request.api_key}"},
            )
            response.raise_for_status()
            data = response.json()
            all_models = [m["id"] for m in data.get("data", [])]
            models = [
                m
                for m in all_models
                if not any(p in m.lower() for p in NON_CHAT_PATTERNS)
            ]
            models.sort()
            return ModelsResponse(models=models)
    except Exception as e:
        logger.error(f"Failed to fetch models: {e}")
        return ModelsResponse(models=[])
