import sys

sys.dont_write_bytecode = True

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.models.ingest import IngestRequest, IngestResponse
from backend.services.vector_store import VectorStoreService
from backend.services.embeddings import EmbeddingsService

logger = logging.getLogger(__name__)

router = APIRouter()

vector_store = VectorStoreService()
embeddings = EmbeddingsService()

CONTENT_COLUMN_NAMES = [
    "content",
    "text",
    "resume",
    "resume_text",
    "resume_str",
    "resume_string",
    "resume_description",
    "description",
    "body",
    "summary",
]
ID_COLUMN_NAMES = ["id", "candidate_id", "resume_id", "name", "candidate"]
EMBEDDING_BATCH_SIZE = 96
CHUNK_SIZE = 1600
CHUNK_OVERLAP = 200


def _normalize_column_name(name: str) -> str:
    return name.lower().strip().replace(" ", "_").replace("-", "_")


def _detect_content_column(df: pd.DataFrame) -> str:
    columns = [_normalize_column_name(str(column)) for column in df.columns]

    for name in CONTENT_COLUMN_NAMES:
        if name in columns:
            return str(df.columns[columns.index(name)])

    text_cols = [
        column
        for column in df.select_dtypes(include=["object"]).columns
        if "html" not in _normalize_column_name(str(column))
    ]

    if not text_cols:
        text_cols = list(df.select_dtypes(include=["object"]).columns)

    if not text_cols:
        raise HTTPException(
            status_code=400,
            detail="Could not find a text content column in CSV. Name it 'content', 'text', 'resume', or 'resume_str'.",
        )

    lengths = df[text_cols].astype(str).apply(lambda series: series.str.len().mean())
    return str(lengths.idxmax())


def _detect_id_column(df: pd.DataFrame) -> Optional[str]:
    columns = [_normalize_column_name(str(column)) for column in df.columns]

    for name in ID_COLUMN_NAMES:
        if name in columns:
            return str(df.columns[columns.index(name)])

    return None


def _parse_file(filename: str, content: bytes) -> List[Tuple[str, str]]:
    """Parse uploaded file into [(id, text), ...] pairs."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "csv":
        return _parse_csv(content)
    elif ext == "pdf":
        return _parse_pdf(content)
    elif ext == "txt":
        return _parse_txt(content)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Use .csv, .pdf, or .txt",
        )


def _parse_csv(content: bytes) -> List[Tuple[str, str]]:
    """Parse CSV — auto-detect content and id columns."""
    df = pd.read_csv(io.BytesIO(content))
    content_col = _detect_content_column(df)
    id_col = _detect_id_column(df)

    documents = df[content_col].fillna("").astype(str).str.strip().tolist()
    if id_col is not None:
        ids = df[id_col].astype(str).tolist()
    else:
        ids = [str(i + 1) for i in range(len(documents))]

    return [
        (doc_id, document)
        for doc_id, document in zip(ids, documents)
        if document and document.lower() != "nan"
    ]


def _parse_pdf(content: bytes) -> List[Tuple[str, str]]:
    """Parse PDF — each PDF is one document."""
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PDF parsing not available. Install PyPDF2.",
        )

    reader = PdfReader(io.BytesIO(content))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)

    text = "\n".join(text_parts).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    return [("1", text)]


def _parse_txt(content: bytes) -> List[Tuple[str, str]]:
    """Parse plain text — entire file is one document."""
    text = content.decode("utf-8", errors="replace").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text file is empty")
    return [("1", text)]


async def _ingest_documents(
    pairs: List[Tuple[str, str]], source: str
) -> IngestResponse:
    """Chunk, embed, and upsert documents to vector store."""
    if not pairs:
        raise HTTPException(status_code=400, detail="No resume text found to ingest.")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

    chunk_batch: List[str] = []
    id_batch: List[str] = []
    metadata_batch: List[Dict[str, Any]] = []
    total_chunks = 0

    for doc_id, doc_text in pairs:
        chunks = text_splitter.split_text(str(doc_text))
        for chunk in chunks:
            total_chunks += 1
            chunk_batch.append(chunk)
            id_batch.append(f"{doc_id}_{total_chunks}")
            metadata_batch.append(
                {
                    "id": doc_id,
                    "chunk_index": total_chunks,
                    "resume_id": doc_id,
                    "document": chunk,
                }
            )

            if len(chunk_batch) >= EMBEDDING_BATCH_SIZE:
                await _embed_and_upsert_batch(chunk_batch, id_batch, metadata_batch)
                chunk_batch = []
                id_batch = []
                metadata_batch = []

    if chunk_batch:
        await _embed_and_upsert_batch(chunk_batch, id_batch, metadata_batch)

    return IngestResponse(
        success=True,
        document_count=len(pairs),
        message=f"Successfully ingested {len(pairs)} resumes from {source} ({total_chunks} chunks)",
        document_ids=[pid for pid, _ in pairs],
    )


async def _embed_and_upsert_batch(
    chunks: List[str],
    ids: List[str],
    metadata: List[Dict[str, Any]],
) -> None:
    embeddings_list = embeddings.embed_documents(chunks)

    success = await vector_store.upsert(
        ids=ids,
        embeddings=embeddings_list,
        documents=chunks,
        metadata=metadata,
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to upsert documents to vector store",
        )


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    request: IngestRequest,
    # current_user: User = Depends(get_current_user),  # Temporarily disabled for testing
) -> IngestResponse:
    try:
        if request.file_url.startswith("s3://") or request.file_url.startswith("r2://"):
            import boto3
            import os
            from urllib.parse import urlparse

            parsed = urlparse(request.file_url)
            bucket = parsed.netloc
            key = parsed.path.lstrip("/")

            s3_client = boto3.client(
                "s3",
                endpoint_url=os.getenv("R2_ENDPOINT"),
                aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
            )

            response = s3_client.get_object(Bucket=bucket, Key=key)
            content = response["Body"].read().decode("utf-8")
            df = pd.read_csv(io.StringIO(content))
        else:
            df = pd.read_csv(request.file_url)

        if request.content_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{request.content_column}' not found in CSV",
            )
        if request.id_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{request.id_column}' not found in CSV",
            )

        documents = df[request.content_column].tolist()
        ids = df[request.id_column].astype(str).tolist()

        pairs = list(zip(ids, documents))
        return await _ingest_documents(pairs, request.file_url.split("/")[-1])

    except Exception as e:
        logger.exception("Ingest failed")
        logger.error(f"Full error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Ingest failed: {type(e).__name__}: {str(e)}"
        )


@router.post("/ingest/upload", response_model=IngestResponse)
async def ingest_upload(
    file: UploadFile = File(...),
):
    """Ingest resumes from an uploaded file (CSV, PDF, or TXT)."""
    try:
        content = await file.read()
        filename = file.filename or "upload"
        pairs = _parse_file(filename, content)
        return await _ingest_documents(pairs, filename)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("File upload ingest failed")
        raise HTTPException(
            status_code=500, detail=f"Ingest failed: {type(e).__name__}: {str(e)}"
        )
