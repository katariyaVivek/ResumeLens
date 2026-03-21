import sys

sys.dont_write_bytecode = True

import logging
import os
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

VECTOR_STORE_PROVIDER = os.getenv("VECTOR_STORE_PROVIDER", "pinecone")


class VectorStoreService:
    def __init__(
        self,
        provider: str = VECTOR_STORE_PROVIDER,
        index_name: Optional[str] = None,
    ):
        self.provider = provider
        self.index_name = index_name or os.getenv(
            "PINECONE_INDEX_NAME", "resumelens-resumes"
        )
        self._client = None
        self._index = None

    @property
    def client(self):
        if self._client is None:
            if self.provider == "pinecone":
                from pinecone import Pinecone

                api_key = os.getenv("PINECONE_API_KEY")
                self._client = Pinecone(api_key=api_key)
            elif self.provider == "qdrant":
                from qdrant_client import QdrantClient

                url = os.getenv("QDRANT_URL")
                api_key = os.getenv("QDRANT_API_KEY")
                self._client = QdrantClient(url=url, api_key=api_key)
            else:
                raise ValueError(f"Unsupported vector store provider: {self.provider}")
        return self._client

    @property
    def index(self):
        if self._index is None:
            if self.provider == "pinecone":
                self._index = self.client.Index(self.index_name)
            elif self.provider == "qdrant":
                self._index = self.client
        return self._index

    async def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        try:
            if self.provider == "pinecone":
                results = self.index.query(
                    vector=query_embedding,
                    top_k=top_k,
                    filter=filter,
                    include_metadata=True,
                )
                return [
                    {
                        "id": match["id"],
                        "score": match["score"],
                        "metadata": match.get("metadata", {}),
                    }
                    for match in results.get("matches", [])
                ]
            elif self.provider == "qdrant":
                results = self.index.search(
                    collection_name=self.index_name,
                    query_vector=query_embedding,
                    limit=top_k,
                    query_filter=filter,
                )
                return [
                    {
                        "id": result.id,
                        "score": result.score,
                        "metadata": result.payload,
                    }
                    for result in results
                ]
        except Exception as e:
            logger.error(f"Similarity search failed: {e}")
            return []

    async def similarity_search_with_score(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter: Optional[Dict[str, Any]] = None,
    ) -> List[tuple]:
        results = await self.similarity_search(
            query_embedding=query_embedding,
            top_k=top_k,
            filter=filter,
        )
        return [(r["id"], r["metadata"], r["score"]) for r in results]

    async def upsert(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        documents: List[str],
        metadata: List[Dict[str, Any]],
    ) -> bool:
        try:
            if self.provider == "pinecone":
                logger.info(
                    f"Pinecone upsert: {len(ids)} vectors, index: {self.index_name}"
                )

                # Pinecone has a 4MB limit per request, so batch the upserts
                batch_size = 100  # Safe batch size
                total_batches = (len(ids) + batch_size - 1) // batch_size

                for batch_num in range(total_batches):
                    start_idx = batch_num * batch_size
                    end_idx = min(start_idx + batch_size, len(ids))

                    vectors = [
                        {
                            "id": ids[i],
                            "values": embeddings[i],
                            "metadata": {
                                **metadata[i],
                                "document": documents[i],
                            },
                        }
                        for i in range(start_idx, end_idx)
                    ]

                    self.index.upsert(vectors=vectors)
                    logger.info(f"Upserted batch {batch_num + 1}/{total_batches}")

                logger.info("Pinecone upsert complete")
                return True
            elif self.provider == "qdrant":
                from qdrant_client.models import PointStruct

                points = [
                    PointStruct(
                        id=ids[i],
                        vector=embeddings[i],
                        payload={
                            **metadata[i],
                            "document": documents[i],
                        },
                    )
                    for i in range(len(ids))
                ]
                self.index.upsert(
                    collection_name=self.index_name,
                    points=points,
                )
                return True
        except Exception as e:
            logger.error(f"Upsert failed: {e}")
            return False
        return False

    async def delete(self, ids: List[str]) -> bool:
        try:
            if self.provider == "pinecone":
                self.index.delete(ids=ids)
                return True
            elif self.provider == "qdrant":
                from qdrant_client.models import Filter

                self.index.delete(
                    collection_name=self.index_name,
                    points_selector=Filter(must=[{"id": {"in": ids}}]),
                )
                return True
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return False
        return False

    async def get_by_id(self, ids: List[str]) -> List[Dict[str, Any]]:
        try:
            if self.provider == "pinecone":
                results = self.index.fetch(ids=ids)
                return [
                    {
                        "id": vec_id,
                        "metadata": vec_data.get("metadata", {}),
                    }
                    for vec_id, vec_data in results.get("vectors", {}).items()
                ]
            elif self.provider == "qdrant":
                from qdrant_client.models import Filter

                results = self.index.retrieve(
                    collection_name=self.index_name,
                    ids=ids,
                )
                return [
                    {
                        "id": result.id,
                        "metadata": result.payload,
                    }
                    for result in results
                ]
        except Exception as e:
            logger.error(f"Get by ID failed: {e}")
            return []
