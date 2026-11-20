import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import SESSION_COOKIE, get_current_user
from app.models import User, UserSession

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_HOURS = 8


class DemoLogin(BaseModel):
    role: Literal["patient", "receptionist", "admin"]


def _user_out(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@router.post("/demo-login")
def demo_login(body: DemoLogin, response: Response, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.role == body.role).order_by(User.id).limit(1))
    if user is None:
        raise HTTPException(503, detail={"code": "demo_user_missing", "message": "Demo data is not seeded. Run the seed."})

    now = datetime.now(UTC)
    token = secrets.token_urlsafe(32)
    db.add(UserSession(token=token, user_id=user.id, created_at=now, expires_at=now + timedelta(hours=SESSION_HOURS)))
    db.commit()

    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=get_settings().cookie_secure,
        path="/",
    )
    return _user_out(user)


@router.post("/logout", status_code=204)
def logout(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> Response:
    if session_token:
        db.execute(delete(UserSession).where(UserSession.token == session_token))
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=get_settings().cookie_secure)
    return response


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return _user_out(user)
