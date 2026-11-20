from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.deps import require_staff
from app.models import User, UserSession


@pytest.mark.parametrize("role", ["patient", "receptionist", "admin"])
def test_demo_login_sets_cookie_and_returns_user(client: TestClient, role: str) -> None:
    response = client.post("/api/auth/demo-login", json={"role": role})

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == role
    assert set(body) == {"id", "name", "email", "role"}
    assert client.cookies.get("session")


def test_me_returns_logged_in_user(login) -> None:
    client = login("patient")

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["name"] == "Maya Patel"
    assert response.json()["role"] == "patient"


def test_me_without_cookie_is_401(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


def test_logout_then_me_is_401(login) -> None:
    client = login("receptionist")

    logout = client.post("/api/auth/logout")

    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_invalid_role_is_422(client: TestClient) -> None:
    response = client.post("/api/auth/demo-login", json={"role": "doctor"})

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "validation_error"


def test_expired_session_is_401(login, db: Session) -> None:
    client = login("patient")
    token = client.cookies.get("session")
    db.execute(
        update(UserSession)
        .where(UserSession.token == token)
        .values(expires_at=datetime.now(UTC) - timedelta(hours=1))
    )
    db.commit()

    assert client.get("/api/auth/me").status_code == 401


def test_session_lasts_eight_hours(login, db: Session) -> None:
    client = login("admin")
    row = db.scalar(select(UserSession).where(UserSession.token == client.cookies.get("session")))

    assert row.expires_at - row.created_at == timedelta(hours=8)


def test_require_staff_forbids_patient_and_allows_staff() -> None:
    patient = User(id=1, name="P", email="p@x.test", role="patient")
    receptionist = User(id=2, name="R", email="r@x.test", role="receptionist")

    with pytest.raises(HTTPException) as excinfo:
        require_staff(patient)
    assert excinfo.value.status_code == 403
    assert excinfo.value.detail["code"] == "forbidden"

    assert require_staff(receptionist) is receptionist
