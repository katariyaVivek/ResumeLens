import sys

sys.dont_write_bytecode = True

import logging
import io

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.models.ingest import IngestRequest, IngestResponse
from backend.models.user import User
from backend.services.vector_store import VectorStoreService
from backend.services.embeddings import EmbeddingsService
from backend.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

vector_store = VectorStoreService()
embeddings = EmbeddingsService()


def _parse_file(filename: str, content: bytes) -> list[tuple[str, str]]:
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


def _parse_csv(content: bytes) -> list[tuple[str, str]]:
    """Parse CSV — auto-detect content and id columns."""
    df = pd.read_csv(io.BytesIO(content))
    columns = [c.lower().strip() for c in df.columns]

    # Auto-detect content column
    content_col = None
    for name in ["content", "text", "resume", "description", "body", "summary"]:
        if name in columns:
            content_col = df.columns[columns.index(name)]
            break
    if not content_col:
        # Use the column with longest average text
        text_cols = df.select_dtypes(include=["object"]).columns
        if len(text_cols) > 0:
            content_col = text_cols[
                df[text_cols].astype(str).apply(len).mean().argmax()
            ]
        else:
            raise HTTPException(
                status_code=400,
                detail="Could not find a text content column in CSV. Name it 'content', 'text', or 'resume'.",
            )

    # Auto-detect ID column
    id_col = None
    for name in ["id", "candidate_id", "resume_id", "name", "candidate"]:
        if name in columns:
            id_col = df.columns[columns.index(name)]
            break
    if not id_col:
        id_col = None  # Will auto-generate IDs

    documents = df[content_col].astype(str).tolist()
    if id_col:
        ids = df[id_col].astype(str).tolist()
    else:
        ids = [str(i + 1) for i in range(len(documents))]

    return list(zip(ids, documents))


def _parse_pdf(content: bytes) -> list[tuple[str, str]]:
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


def _parse_txt(content: bytes) -> list[tuple[str, str]]:
    """Parse plain text — entire file is one document."""
    text = content.decode("utf-8", errors="replace").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text file is empty")
    return [("1", text)]


def _ingest_documents(pairs: list[tuple[str, str]], source: str) -> IngestResponse:
    """Chunk, embed, and upsert documents to vector store."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1024,
        chunk_overlap=500,
    )

    all_chunks = []
    all_ids = []
    all_metadata = []

    for doc_id, doc_text in pairs:
        chunks = text_splitter.split_text(str(doc_text))
        for chunk in chunks:
            all_chunks.append(chunk)
            chunk_id = f"{doc_id}_{len(all_chunks)}"
            all_ids.append(chunk_id)
            all_metadata.append(
                {
                    "id": doc_id,
                    "chunk_index": len(all_chunks),
                    "resume_id": doc_id,
                    "document": chunk,
                }
            )

    embeddings_list = embeddings.embed_documents(all_chunks)

    success = vector_store.upsert(
        ids=all_ids,
        embeddings=embeddings_list,
        documents=all_chunks,
        metadata=all_metadata,
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to upsert documents to vector store",
        )

    return IngestResponse(
        success=True,
        document_count=len(pairs),
        message=f"Successfully ingested {len(pairs)} resumes from {source}",
        document_ids=[pid for pid, _ in pairs],
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
        return _ingest_documents(pairs, request.file_url.split("/")[-1])

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
        return _ingest_documents(pairs, filename)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("File upload ingest failed")
        raise HTTPException(
            status_code=500, detail=f"Ingest failed: {type(e).__name__}: {str(e)}"
        )
