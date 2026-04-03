"""
Recording Manager.

Browser sends MediaRecorder chunks via POST. Server writes them to a .webm file.
Metadata (class_name, topic_name, timestamp) is stored per-session and persisted
to recordings/metadata.json on stop.

Endpoints:
  POST /api/rooms/recordings/start          → create session, returns session_id
  POST /api/rooms/recordings/chunk/{id}     → append binary chunk
  POST /api/rooms/recordings/stop/{id}      → finalise file + save metadata
  GET  /api/rooms/recordings/               → list recordings with metadata
  GET  /api/rooms/recordings/{filename}     → stream for in-app player + download
"""

import os
import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import Dict

import aiofiles
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from utils.auth_utils import get_current_user

router = APIRouter()

RECORDINGS_DIR = Path(os.getenv("RECORDINGS_DIR", "recordings"))
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

METADATA_FILE = RECORDINGS_DIR / "metadata.json"

# session_id -> {"path": Path, "file_handle": aiofiles, "meta": {...}}
_active_sessions: Dict[str, dict] = {}


def _load_metadata() -> list:
    if METADATA_FILE.exists():
        try:
            return json.loads(METADATA_FILE.read_text())
        except Exception:
            return []
    return []


def _save_metadata(entries: list):
    METADATA_FILE.write_text(json.dumps(entries, indent=2))


class StartRecordingRequest(BaseModel):
    class_name: str = "Class"
    topic_name: str = "Lecture"
    room_id: str = ""


@router.post("/start")
async def start_recording(
    body: StartRecordingRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can start recordings")

    session_id = str(uuid.uuid4())
    now = datetime.now()
    timestamp_str = now.strftime("%Y-%m-%d_%H-%M")

    safe_class = "".join(c if c.isalnum() or c in "- " else "_" for c in body.class_name).strip().replace(" ", "-")
    safe_topic = "".join(c if c.isalnum() or c in "- " else "_" for c in body.topic_name).strip().replace(" ", "-")
    filename = f"{safe_class}_{safe_topic}_{timestamp_str}.webm"
    filepath = RECORDINGS_DIR / filename

    fh = await aiofiles.open(filepath, "wb")
    _active_sessions[session_id] = {
        "path": filepath,
        "file_handle": fh,
        "meta": {
            "class_name": body.class_name,
            "topic_name": body.topic_name,
            "room_id": body.room_id,
            "filename": filename,
            "timestamp": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M"),
            "size": 0,
        },
    }

    return {"sessionId": session_id, "filename": filename}


@router.post("/chunk/{session_id}")
async def append_chunk(
    session_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Recording session not found")

    body = await request.body()
    if body:
        fh = _active_sessions[session_id]["file_handle"]
        await fh.write(body)
        _active_sessions[session_id]["meta"]["size"] += len(body)

    return {"ok": True}


@router.post("/stop/{session_id}")
async def stop_recording(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Recording session not found")

    session = _active_sessions.pop(session_id)
    await session["file_handle"].close()

    filepath: Path = session["path"]
    actual_size = filepath.stat().st_size if filepath.exists() else 0
    meta = session["meta"]
    meta["size"] = actual_size

    entries = _load_metadata()
    entries.insert(0, meta)
    _save_metadata(entries)

    return {
        "filename": meta["filename"],
        "class_name": meta["class_name"],
        "topic_name": meta["topic_name"],
        "timestamp": meta["timestamp"],
        "size": actual_size,
    }


@router.get("/")
async def list_recordings(current_user: dict = Depends(get_current_user)):
    """Return recordings enriched with metadata where available."""
    metadata = {e["filename"]: e for e in _load_metadata()}

    results = []
    for f in sorted(RECORDINGS_DIR.iterdir(), reverse=True):
        if f.is_file() and f.suffix in (".webm", ".mp4", ".mkv"):
            meta = metadata.get(f.name, {})
            results.append(
                {
                    "filename": f.name,
                    "size": f.stat().st_size,
                    "created": datetime.fromtimestamp(f.stat().st_ctime).isoformat(),
                    "class_name": meta.get("class_name", "Unknown Class"),
                    "topic_name": meta.get("topic_name", "Unknown Topic"),
                    "date": meta.get("date", ""),
                    "time": meta.get("time", ""),
                    "timestamp": meta.get("timestamp", ""),
                    "room_id": meta.get("room_id", ""),
                }
            )
    return results


@router.get("/stream/{filename}")
async def stream_recording(
    filename: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Stream a recording file with range support for in-app video player."""
    # Security: prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = RECORDINGS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = filepath.stat().st_size
    media_type = "video/webm" if filename.endswith(".webm") else "video/mp4"

    range_header = request.headers.get("range")

    if range_header:
        # Parse range header
        range_val = range_header.replace("bytes=", "")
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        chunk_size = end - start + 1

        async def file_chunk():
            async with aiofiles.open(filepath, "rb") as f:
                await f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    read_size = min(65536, remaining)
                    data = await f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": media_type,
        }
        return StreamingResponse(file_chunk(), status_code=206, headers=headers)

    # Full file
    return FileResponse(
        filepath,
        media_type=media_type,
        headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
    )


@router.get("/{filename}")
async def download_recording(
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Download a recording file."""
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = RECORDINGS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "video/webm" if filename.endswith(".webm") else "video/mp4"
    return FileResponse(
        filepath,
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
