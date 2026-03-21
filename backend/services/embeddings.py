import sys

sys.dont_write_bytecode = True

import logging
from typing import List

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class EmbeddingsService:
    def __init__(self, model_name: str = EMBEDDING_MODEL):
        self.model_name = model_name
        self._model = None

    @property
    def model(self):
        if self._model is None:
            self._model = SentenceTransformer(self.model_name)
        return self._model

    def embed_query(self, query: str) -> List[float]:
        embedding = self.model.encode(query, convert_to_numpy=True)
        return embedding.tolist()

    def embed_documents(self, documents: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(documents, convert_to_numpy=True)
        return embeddings.tolist()

    async def embed_query_async(self, query: str) -> List[float]:
        return self.embed_query(query)

    async def embed_documents_async(self, documents: List[str]) -> List[List[float]]:
        return self.embed_documents(documents)
