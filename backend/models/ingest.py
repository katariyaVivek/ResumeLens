import sys

sys.dont_write_bytecode = True

from typing import Optional
from pydantic import BaseModel


class IngestRequest(BaseModel):
    file_url: str
    content_column: str = "Resume"
    id_column: str = "ID"


class IngestResponse(BaseModel):
    success: bool
    document_count: int
    message: str
    document_ids: Optional[list[str]] = None
