import sys

sys.dont_write_bytecode = True

import json
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.models.chat import (
    ChatRequest,
    ChatResponse,
    RAGMode,
    ModelsRequest,
    ModelsResponse,
)
from backend.services.rag import RAGService
from backend.services.rag_fusion import RAGFusionService
from backend.services.vector_store import VectorStoreService
from backend.services.embeddings import EmbeddingsService
from backend.services.llm import LLMService

logger = logging.getLogger(__name__)

router = APIRouter()

vector_store = VectorStoreService()
embeddings = EmbeddingsService()

NON_CHAT_MODEL_PATTERNS = (
    "whisper",
    "tts",
    "stt",
    "embed",
    "embedding",
    "rerank",
    "prompt-guard",
    "guard",
    "moderation",
    "dall-e",
    "stable-diffusion",
    "orpheus",
)


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


def _normalize_models_base_url(api_base: str) -> str:
    cleaned = api_base.strip().rstrip("/")

    if not cleaned:
        return cleaned

    if not cleaned.startswith(("http://", "https://")):
        cleaned = f"https://{cleaned}"

    if cleaned == "https://api.groq.com":
        return "https://api.groq.com/openai/v1"

    return cleaned


def _extract_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"Model fetch failed with status {response.status_code}."

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(payload.get("detail"), str):
            return payload["detail"]

    return f"Model fetch failed with status {response.status_code}."


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
            try:
                async for chunk in llm.generate_response_stream(
                    query=request.message,
                    documents=documents,
                    query_type=query_type,
                    chat_history=chat_history,
                ):
                    yield f"data: {json.dumps(chunk)}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield f"data: {json.dumps(f'Error: {str(e)}')}\n\n"
            yield "data: [DONE]\n\n"

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
    api_base = _normalize_models_base_url(request.api_base)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{api_base}/models",
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Content-Type": "application/json",
                },
            )

            if response.status_code >= 400:
                return ModelsResponse(
                    models=[],
                    error=_extract_error_message(response),
                )

            data = response.json()
            all_models = [
                model["id"]
                for model in data.get("data", [])
                if isinstance(model, dict) and isinstance(model.get("id"), str)
            ]
            models = [
                model
                for model in all_models
                if not any(
                    pattern in model.lower()
                    for pattern in NON_CHAT_MODEL_PATTERNS
                )
            ]
            models.sort()
            return ModelsResponse(models=models)
    except httpx.TimeoutException:
        logger.warning("Model fetch timed out for base URL: %s", api_base)
        return ModelsResponse(models=[], error="Model fetch timed out.")
    except httpx.RequestError as e:
        logger.warning("Model fetch request failed for base URL %s: %s", api_base, e)
        return ModelsResponse(
            models=[],
            error="Backend could not reach the model provider.",
        )
    except ValueError:
        logger.exception("Model provider returned invalid JSON")
        return ModelsResponse(
            models=[],
            error="Model provider returned an unreadable response.",
        )
