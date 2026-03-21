import sys

sys.dont_write_bytecode = True

import logging
import re
from typing import List, Dict, Any, Optional

from backend.services.vector_store import VectorStoreService
from backend.services.embeddings import EmbeddingsService
from backend.services.llm import LLMService

logger = logging.getLogger(__name__)

RAG_K_THRESHOLD = 5
RRF_K_CONSTANT = 60


class RAGFusionService:
    def __init__(
        self,
        vector_store: VectorStoreService,
        embeddings: EmbeddingsService,
        llm: LLMService,
    ):
        self.vector_store = vector_store
        self.embeddings = embeddings
        self.llm = llm
        self._id_set: Optional[set] = None

    def set_id_set(self, id_set: set) -> None:
        self._id_set = id_set

    def classify_query(
        self,
        query: str,
        df_ids: Optional[List[str]] = None,
    ) -> str:
        if df_ids:
            candidate_ids = re.findall(r"\b\d+\b", query)
            id_list = [cid for cid in candidate_ids if cid in df_ids]
            if id_list:
                return "retrieve_applicant_id"

        if query.strip():
            return "retrieve_applicant_jd"

        return "no_retrieve"

    def _reciprocal_rank_fusion(
        self,
        document_rank_list: List[Dict[str, float]],
        k: int = RRF_K_CONSTANT,
    ) -> Dict[str, float]:
        fused_scores: Dict[str, float] = {}
        for doc_list in document_rank_list:
            for doc_id, score in doc_list.items():
                if doc_id not in fused_scores:
                    fused_scores[doc_id] = 0.0
                fused_scores[doc_id] += 1.0 / (score + k)

        reranked = dict(sorted(fused_scores.items(), key=lambda x: x[1], reverse=True))
        return reranked

    async def _generate_subquestions(self, query: str) -> List[str]:
        subquestions = await self.llm.generate_subquestions(query)
        return [query] + subquestions

    async def retrieve(
        self,
        query: str,
        query_type: str,
        df_ids: Optional[List[str]] = None,
        rag_mode: str = "RAG Fusion",
        top_k: int = 5,
    ) -> Dict[str, Any]:
        result = {
            "documents": [],
            "query_type": query_type,
            "subquestion_list": [],
            "retrieved_docs_with_scores": {},
        }

        if query_type == "no_retrieve":
            return result

        if query_type == "retrieve_applicant_id":
            candidate_ids = re.findall(r"\b\d+\b", query)
            id_list = [cid for cid in candidate_ids if cid in (df_ids or [])]
            result["query_type"] = "retrieve_applicant_id"
            result["extracted_input"] = {"id_list": id_list}
            result["documents"] = []
            return result

        result["query_type"] = "retrieve_applicant_jd"
        result["extracted_input"] = {"job_description": query}

        subquestion_list = [query]
        if rag_mode == "RAG Fusion":
            try:
                subquestion_list += await self._generate_subquestions(query)
            except Exception as e:
                logger.warning(f"Sub-question generation failed: {e}")

        result["subquestion_list"] = subquestion_list

        document_rank_list: List[Dict[str, float]] = []
        for subquestion in subquestion_list:
            query_embedding = self.embeddings.embed_query(subquestion)
            docs_with_scores = await self.vector_store.similarity_search_with_score(
                query_embedding=query_embedding,
                top_k=RAG_K_THRESHOLD,
            )
            rank_dict = {
                doc_id: float(score) for doc_id, metadata, score in docs_with_scores
            }
            document_rank_list.append(rank_dict)

        reranked = self._reciprocal_rank_fusion(document_rank_list)
        result["retrieved_docs_with_scores"] = reranked

        sorted_ids = list(reranked.keys())[:top_k]

        # Fetch actual document content from Pinecone
        if sorted_ids:
            try:
                docs = await self.vector_store.get_by_id(sorted_ids)
                result["documents"] = [
                    doc.get("metadata", {}).get("document", "") for doc in docs
                ]
            except Exception as e:
                logger.warning(f"Failed to fetch documents: {e}")
                result["documents"] = []
        else:
            result["documents"] = []

        return result

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
