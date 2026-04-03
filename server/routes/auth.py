"""
Authentication routes.
Pre-seeded accounts:
  teacher@classflow.com / teacher123  (role: teacher)
  student@classflow.com / student123  (role: student)
"""

import uuid
from typing import Dict
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from utils.auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

_users: Dict[str, dict] = {}


def _seed():
    for email, name, password, role in [
        ("teacher@classflow.com", "Alex Teacher", "teacher123", "teacher"),
        ("student@classflow.com", "Sam Student", "student123", "student"),
        ("student2@classflow.com", "Jordan Student", "student123", "student"),
    ]:
        uid = str(uuid.uuid4())
        _users[email] = {
            "id": uid,
            "email": email,
            "name": name,
            "password": hash_password(password),
            "role": role,
        }


_seed()


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "student"


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    if body.email in _users:
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.role not in ("teacher", "student"):
        raise HTTPException(status_code=400, detail="Role must be 'teacher' or 'student'")

    uid = str(uuid.uuid4())
    _users[body.email] = {
        "id": uid,
        "email": body.email,
        "name": body.name,
        "password": hash_password(body.password),
        "role": body.role,
    }
    token = create_access_token({"sub": uid, "name": body.name, "role": body.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": uid, "name": body.name, "role": body.role, "email": body.email},
    }


@router.post("/login")
async def login(body: LoginRequest):
    user = _users.get(body.email)
    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": user["id"], "name": user["name"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "role": user["role"],
            "email": user["email"],
        },
    }


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user
