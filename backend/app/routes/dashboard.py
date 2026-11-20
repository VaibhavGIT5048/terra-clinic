from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import STAFF_ROLES, get_current_user
from app.models import Appointment, Slot, User
from app.routes.appointments import AppointmentItem, item_query, to_item

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str


class Counts(BaseModel):
    upcoming: int
    completed: int
    cancelled: int


class ActivityItem(BaseModel):
    kind: Literal["booked", "cancelled", "completed"]
    text: str
    at: datetime


class DashboardOut(BaseModel):
    user: UserOut
    next_appointment: AppointmentItem | None
    counts: Counts
    recent_activity: list[ActivityItem]


def _scoped(stmt, user: User):
    # Staff see the whole clinic; patients see only their own appointments.
    if user.role in STAFF_ROLES:
        return stmt
    return stmt.where(Appointment.patient_id == user.id)


def _when(starts_at: datetime) -> str:
    return f"{starts_at:%a} {starts_at.day} {starts_at:%b}, {starts_at:%H:%M}"


def _activity_text(kind: str, doctor_name: str, starts_at: datetime) -> str:
    when = _when(starts_at)
    if kind == "booked":
        return f"Booked {doctor_name} on {when}"
    if kind == "cancelled":
        return f"Cancelled {doctor_name} on {when}"
    return f"Completed visit with {doctor_name} on {when}"


@router.get("", response_model=DashboardOut)
def get_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    now = datetime.now(UTC)

    upcoming = db.scalar(
        _scoped(
            select(func.count())
            .select_from(Appointment)
            .join(Slot, Appointment.slot_id == Slot.id)
            .where(Appointment.status.in_(["booked"]), Slot.starts_at > now),
            user,
        )
    )
    completed = db.scalar(_scoped(select(func.count()).select_from(Appointment).where(Appointment.status.in_(["completed"])), user))
    cancelled = db.scalar(_scoped(select(func.count()).select_from(Appointment).where(Appointment.status.in_(["cancelled"])), user))

    next_row = db.execute(
        _scoped(item_query(), user)
        .where(Appointment.status.in_(["booked"]), Slot.starts_at > now)
        .order_by(Slot.starts_at, Appointment.id)
        .limit(1)
    ).first()
    next_appointment: AppointmentItem | None = to_item(next_row) if next_row else None

    activity = []
    recent_rows = db.execute(
        item_query()
        .where(Appointment.patient_id == user.id, Appointment.status.in_(["booked", "cancelled", "completed"]))
        .order_by(Appointment.updated_at.desc(), Appointment.id.desc())
        .limit(5)
    ).all()
    for appointment, slot, doctor, _patient in recent_rows:
        activity.append(
            ActivityItem(
                kind=appointment.status,
                text=_activity_text(appointment.status, doctor.name, slot.starts_at),
                at=appointment.updated_at,
            )
        )

    return DashboardOut(
        user=UserOut(id=user.id, name=user.name, email=user.email, role=user.role),
        next_appointment=next_appointment,
        counts=Counts(upcoming=upcoming, completed=completed, cancelled=cancelled),
        recent_activity=activity,
    )
