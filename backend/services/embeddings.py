import sys

sys.dont_write_bytecode = True

import logging
from typing import List

from fastembed import TextEmbedding

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class EmbeddingsService:
    def __init__(self, model_name: str = EMBEDDING_MODEL):
        self.model_name = model_name
        self._model = None

    @property
    def model(self):
        if self._model is None:
            logger.info(f"Loading FastEmbed model: {self.model_name}")
            self._model = TextEmbedding(model_name=self.model_name)
            logger.info(f"FastEmbed model loaded: {self.model_name}")
        return self._model

    def embed_query(self, query: str) -> List[float]:
        result = list(self.model.embed([query]))
        return result[0].tolist()

    def embed_documents(self, documents: List[str]) -> List[List[float]]:
        result = list(self.model.embed(documents))
        return [r.tolist() for r in result]

    async def embed_query_async(self, query: str) -> List[float]:
        return self.embed_query(query)

    async def embed_documents_async(self, documents: List[str]) -> List[List[float]]:
        return self.embed_documents(documents)
