"""
Room management routes.
Rooms are stored in-memory. In production, swap for a real database.

A "room" is synonymous with a "class" — the room ID is the classId used
in shareable links: /class/<classId>
"""

import uuid
from typing import Dict
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from utils.auth_utils import get_current_user
from recording import router as recording_router

router = APIRouter()
router.include_router(recording_router, prefix="/recordings")

# ── In-memory room store ──────────────────────────────────────────────────────
_rooms: Dict[str, dict] = {}

# Pre-seed a demo room
_demo_room_id = "demo-room-001"
_rooms[_demo_room_id] = {
    "id": _demo_room_id,
    "name": "Demo Class Room",
    "subject": "Mathematics",
    "topic": "Introduction to Calculus",
    "teacherName": "Alex Teacher",
    "createdAt": datetime.now().isoformat(),
    "active": False,
}


# ── Schemas ────────────────────────────────────────────────────────────────────
class CreateRoomRequest(BaseModel):
    name: str
    subject: str = ""
    topic: str = ""


# ── Routes ────────────────────────────────────────────────────────────────────
@router.get("/")
async def list_rooms(current_user: dict = Depends(get_current_user)):
    return list(_rooms.values())


@router.post("/", status_code=201)
async def create_room(
    body: CreateRoomRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create rooms")

    # Short, URL-safe ID — also the classId for link sharing
    room_id = str(uuid.uuid4())[:8]
    _rooms[room_id] = {
        "id": room_id,
        "name": body.name,
        "subject": body.subject,
        "topic": body.topic,
        "teacherName": current_user["name"],
        "teacherId": current_user["id"],
        "createdAt": datetime.now().isoformat(),
        "active": False,
    }
    return _rooms[room_id]


@router.get("/{room_id}")
async def get_room(room_id: str, current_user: dict = Depends(get_current_user)):
    room = _rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.patch("/{room_id}/active")
async def set_room_active(
    room_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can start/end class")
    room = _rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room["active"] = body.get("active", False)
    if body.get("active") and body.get("topic"):
        room["topic"] = body.get("topic")
    return room


# ── Public endpoint: validate classId before student joins ───────────────────
@router.get("/validate/{room_id}")
async def validate_room(room_id: str):
    """No auth needed — lets the join page check if a class link is valid."""
    room = _rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Class not found")
    return {
        "id": room["id"],
        "name": room["name"],
        "subject": room.get("subject", ""),
        "topic": room.get("topic", ""),
        "teacherName": room["teacherName"],
        "active": room["active"],
    }
