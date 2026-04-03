"""
ClassFlow API — main entry point.
Run with: uvicorn main:app --host 0.0.0.0 --port 10000
"""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

RECORDINGS_DIR = Path(os.getenv("RECORDINGS_DIR", "recordings"))
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

FRONTEND_URL = os.getenv("FRONTEND_URL", "*")

app = FastAPI(title="ClassFlow API", version="2.0.0")

allowed_origins = ["*"] if FRONTEND_URL == "*" else [FRONTEND_URL, "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve recording files directly (for in-app player and download)
app.mount("/recordings", StaticFiles(directory=str(RECORDINGS_DIR)), name="recordings")

# Routers
from routes.auth import router as auth_router
from routes.rooms import router as rooms_router
from signaling import router as ws_router

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(rooms_router, prefix="/api/rooms", tags=["rooms"])
app.include_router(ws_router, tags=["websocket"])


@app.get("/")
async def root():
    return {"message": "ClassFlow API is running", "docs": "/docs", "version": "2.0.0"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
