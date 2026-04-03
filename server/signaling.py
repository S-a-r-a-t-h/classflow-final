"""
WebRTC Signaling Server via WebSockets.
Handles: join-room, offer, answer, ice-candidate, chat, raise-hand, mute-user
Uses classId (room_id) so teacher-generated links work directly.
"""

import json
import asyncio
from typing import Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from utils.auth_utils import decode_token_ws

router = APIRouter()

# room_id -> {user_id -> {"ws": WebSocket, "name": str, "role": str, ...}}
rooms: Dict[str, Dict[str, Dict[str, Any]]] = {}


async def broadcast_to_room(room_id: str, message: dict, exclude_user: str = None):
    if room_id not in rooms:
        return
    dead = []
    for uid, data in list(rooms[room_id].items()):
        if uid == exclude_user:
            continue
        try:
            await data["ws"].send_json(message)
        except Exception:
            dead.append(uid)
    for uid in dead:
        rooms[room_id].pop(uid, None)


async def send_to_user(room_id: str, user_id: str, message: dict):
    if room_id not in rooms or user_id not in rooms[room_id]:
        return
    try:
        await rooms[room_id][user_id]["ws"].send_json(message)
    except Exception:
        rooms[room_id].pop(user_id, None)


def get_room_participants(room_id: str):
    if room_id not in rooms:
        return []
    return [
        {
            "userId": uid,
            "name": data["name"],
            "role": data["role"],
            "handRaised": data.get("hand_raised", False),
            "muted": data.get("muted", False),
        }
        for uid, data in rooms[room_id].items()
    ]


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    user_id = None
    user_name = "Anonymous"
    user_role = "student"

    try:
        # First message must be authentication
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=15.0)

        if auth_msg.get("type") != "auth":
            await websocket.send_json({"type": "error", "message": "First message must be auth"})
            await websocket.close()
            return

        token = auth_msg.get("token", "")
        payload = decode_token_ws(token)

        if not payload:
            await websocket.send_json({"type": "error", "message": "Invalid token"})
            await websocket.close()
            return

        user_id = payload.get("sub")
        user_name = payload.get("name", "Anonymous")
        user_role = payload.get("role", "student")

        if room_id not in rooms:
            rooms[room_id] = {}

        # If user already has a stale connection, close it
        if user_id in rooms[room_id]:
            try:
                await rooms[room_id][user_id]["ws"].close()
            except Exception:
                pass

        rooms[room_id][user_id] = {
            "ws": websocket,
            "name": user_name,
            "role": user_role,
            "hand_raised": False,
            "muted": False,
        }

        # Notify existing participants
        await broadcast_to_room(
            room_id,
            {
                "type": "user-joined",
                "userId": user_id,
                "name": user_name,
                "role": user_role,
                "participants": get_room_participants(room_id),
            },
            exclude_user=user_id,
        )

        # Send room state to new user (includes all existing peers so they can initiate offers)
        await websocket.send_json(
            {
                "type": "room-state",
                "userId": user_id,
                "participants": get_room_participants(room_id),
            }
        )

        # Main message loop
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "offer":
                target = data.get("target")
                await send_to_user(
                    room_id, target,
                    {"type": "offer", "offer": data["offer"], "from": user_id, "name": user_name},
                )

            elif msg_type == "answer":
                target = data.get("target")
                await send_to_user(
                    room_id, target,
                    {"type": "answer", "answer": data["answer"], "from": user_id},
                )

            elif msg_type == "ice-candidate":
                target = data.get("target")
                await send_to_user(
                    room_id, target,
                    {"type": "ice-candidate", "candidate": data["candidate"], "from": user_id},
                )

            elif msg_type == "chat":
                await broadcast_to_room(
                    room_id,
                    {
                        "type": "chat",
                        "from": user_id,
                        "name": user_name,
                        "message": data.get("message", ""),
                        "role": user_role,
                    },
                )

            elif msg_type == "raise-hand":
                raised = data.get("raised", True)
                if room_id in rooms and user_id in rooms[room_id]:
                    rooms[room_id][user_id]["hand_raised"] = raised
                await broadcast_to_room(
                    room_id,
                    {"type": "hand-raised", "userId": user_id, "name": user_name, "raised": raised},
                )

            elif msg_type == "mute-user":
                if user_role == "teacher":
                    target = data.get("target")
                    muted = data.get("muted", True)
                    if room_id in rooms and target in rooms[room_id]:
                        rooms[room_id][target]["muted"] = muted
                    await send_to_user(
                        room_id, target,
                        {"type": "force-mute", "muted": muted, "by": user_name},
                    )
                    await broadcast_to_room(
                        room_id,
                        {"type": "participant-muted", "userId": target, "muted": muted},
                    )

            elif msg_type == "recording-status":
                if user_role == "teacher":
                    await broadcast_to_room(
                        room_id,
                        {"type": "recording-status", "recording": data.get("recording", False)},
                        exclude_user=user_id,
                    )

    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        try:
            await websocket.close()
        except Exception:
            pass
    except Exception as e:
        print(f"WebSocket error for {user_id}: {e}")
    finally:
        if user_id and room_id in rooms:
            rooms[room_id].pop(user_id, None)
            if not rooms[room_id]:
                del rooms[room_id]
            else:
                await broadcast_to_room(
                    room_id,
                    {
                        "type": "user-left",
                        "userId": user_id,
                        "name": user_name,
                        "participants": get_room_participants(room_id),
                    },
                )
