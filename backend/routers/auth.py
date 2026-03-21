import sys

sys.dont_write_bytecode = True

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient
from pydantic import BaseModel

from backend.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer(auto_error=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def get_supabase_jwks_url() -> str:
    return f"{SUPABASE_URL}/.well-known/jwks.json"


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials

    try:
        if SUPABASE_SERVICE_ROLE_KEY:
            jwks_client = PyJWKClient(get_supabase_jwks_url())
            signing_key = jwks_client.get_signing_key_from_jwt(token)

            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience="authenticated",
                options={"verify_exp": True},
            )
        else:
            payload = jwt.decode(
                token,
                options={"verify_signature": False},
            )

        user_id = payload.get("sub")
        email = payload.get("email", "")
        role = payload.get("role", "user")

        return User(
            id=user_id,
            email=email,
            role=UserRole(role)
            if role in [r.value for r in UserRole]
            else UserRole.USER,
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    raise HTTPException(
        status_code=501,
        detail="Auth is handled by Supabase. Use Supabase client in frontend.",
    )


@router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
