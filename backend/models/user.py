import sys

sys.dont_write_bytecode = True

from typing import Optional
from enum import Enum

from pydantic import BaseModel


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


class User(BaseModel):
    id: str
    email: str
    role: UserRole = UserRole.USER
    created_at: Optional[str] = None
