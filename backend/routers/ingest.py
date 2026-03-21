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

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1024,
            chunk_overlap=500,
        )

        all_chunks = []
        all_ids = []
        all_metadata = []

        for idx, doc in enumerate(documents):
            chunks = text_splitter.split_text(doc)
            for chunk in chunks:
                all_chunks.append(chunk)
                all_ids.append(f"{ids[idx]}_{len(all_chunks)}")
                all_metadata.append(
                    {
                        "id": ids[idx],
                        "chunk_index": len(all_chunks),
                        "resume_id": ids[idx],
                        "document": chunk,
                    }
                )

        embeddings_list = embeddings.embed_documents(all_chunks)

        success = await vector_store.upsert(
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
            document_count=len(ids),
            message=f"Successfully ingested {len(ids)} resumes",
            document_ids=ids,
        )

    except Exception as e:
        logger.exception("Ingest failed")
        logger.error(f"Full error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Ingest failed: {type(e).__name__}: {str(e)}"
        )


@router.post("/ingest/upload", response_model=IngestResponse)
async def ingest_upload(
    file: UploadFile = File(...),
    content_column: str = Form("content"),
    id_column: str = Form("id"),
):
    """Ingest resumes from an uploaded CSV file."""
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))

        if content_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{content_column}' not found in CSV",
            )
        if id_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{id_column}' not found in CSV",
            )

        documents = df[content_column].tolist()
        ids = df[id_column].astype(str).tolist()

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1024,
            chunk_overlap=500,
        )

        all_chunks = []
        all_ids = []
        all_metadata = []

        for idx, doc in enumerate(documents):
            chunks = text_splitter.split_text(str(doc))
            for chunk in chunks:
                all_chunks.append(chunk)
                all_ids.append(f"{ids[idx]}_{len(all_chunks)}")
                all_metadata.append(
                    {
                        "id": ids[idx],
                        "chunk_index": len(all_chunks),
                        "resume_id": ids[idx],
                        "document": chunk,
                    }
                )

        embeddings_list = embeddings.embed_documents(all_chunks)

        success = await vector_store.upsert(
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
            document_count=len(ids),
            message=f"Successfully ingested {len(ids)} resumes from {file.filename}",
            document_ids=ids,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("File upload ingest failed")
        raise HTTPException(
            status_code=500, detail=f"Ingest failed: {type(e).__name__}: {str(e)}"
        )
