import sys

sys.dont_write_bytecode = True

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import chat, ingest, auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ResumeLens Backend")
    yield
    logger.info("Shutting down ResumeLens Backend")


app = FastAPI(
    title="ResumeLens API",
    description="AI-powered resume screening chatbot API",
    version="1.0.0",
    lifespan=lifespan,
)

import os

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(ingest.router, prefix="/api", tags=["ingest"])


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
