import sys

sys.dont_write_bytecode = True

import logging
from typing import List, Dict, Any, Optional

from backend.services.vector_store import VectorStoreService
from backend.services.embeddings import EmbeddingsService
from backend.services.llm import LLMService
from backend.models.chat import RAGMode

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(
        self,
        vector_store: VectorStoreService,
        embeddings: EmbeddingsService,
        llm: LLMService,
    ):
        self.vector_store = vector_store
        self.embeddings = embeddings
        self.llm = llm

    async def retrieve(
        self,
        query: str,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        query_embedding = self.embeddings.embed_query(query)
        results = await self.vector_store.similarity_search(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        return results

    async def generate_response(
        self,
        query: str,
        documents: List[str],
        query_type: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        return await self.llm.generate_response(
            query=query,
            documents=documents,
            query_type=query_type,
            chat_history=chat_history,
        )
