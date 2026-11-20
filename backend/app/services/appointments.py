"""The only code that changes appointments.

Appointment states: booked -> booked (reschedule), booked -> cancelled. Everything else is terminal.
Each move runs in one transaction. The partial unique index uq_appointments_slot_booked is the
double-booking guard; an IntegrityError on it becomes ServiceError 409 slot_taken.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Appointment, Slot, User
from app.services.errors import ServiceError

SLOT_GUARD = "uq_appointments_slot_booked"


def _is_slot_guard(exc: IntegrityError) -> bool:
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None) == SLOT_GUARD


@contextmanager
def _transaction(db: Session) -> Iterator[None]:
    try:
        yield
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _is_slot_guard(exc):
            raise ServiceError(409, "slot_taken", "That time slot was just taken. Pick another.") from exc
        raise
    except BaseException:
        db.rollback()
        raise


def _slot_or_404(db: Session, slot_id: int) -> Slot:
    slot = db.get(Slot, slot_id)
    if slot is None:
        raise ServiceError(404, "slot_not_found", "That time slot does not exist.")
    return slot


def _slot_is_taken(db: Session, slot_id: int) -> bool:
    return db.scalar(select(Appointment.id).where(Appointment.slot_id == slot_id, Appointment.status == "booked")) is not None


def _locked_appointment(db: Session, appointment_id: int) -> Appointment:
    appointment = db.scalar(select(Appointment).where(Appointment.id == appointment_id).with_for_update())
    if appointment is None:
        raise ServiceError(404, "appointment_not_found", "That appointment does not exist.")
    return appointment


def book(db: Session, *, patient_id: int, slot_id: int, reason: str, now: datetime | None = None) -> Appointment:
    now = now or datetime.now(UTC)
    with _transaction(db):
        slot = _slot_or_404(db, slot_id)
        if slot.starts_at <= now:
            raise ServiceError(422, "slot_in_past", "That time has already passed.")
        is_patient = db.scalar(select(User.id).where(User.id == patient_id, User.role == "patient"))
        if is_patient is None:
            raise ServiceError(404, "patient_not_found", "That patient does not exist.")
        if _slot_is_taken(db, slot_id):
            raise ServiceError(409, "slot_taken", "That time slot was just taken. Pick another.")
        appointment = Appointment(
            patient_id=patient_id,
            slot_id=slot_id,
            status="booked",
            reason=reason,
            created_at=now,
            updated_at=now,
        )
        db.add(appointment)
        db.flush()
    return appointment


def reschedule(db: Session, *, appointment_id: int, new_slot_id: int, now: datetime | None = None) -> Appointment:
    now = now or datetime.now(UTC)
    with _transaction(db):
        appointment = _locked_appointment(db, appointment_id)
        if appointment.status != "booked" or db.get(Slot, appointment.slot_id).starts_at <= now:
            raise ServiceError(409, "invalid_state", "Only an upcoming booked appointment can be rescheduled.")
        if new_slot_id == appointment.slot_id:
            raise ServiceError(409, "slot_taken", "That is already your time slot.")
        new_slot = _slot_or_404(db, new_slot_id)
        if new_slot.starts_at <= now:
            raise ServiceError(422, "slot_in_past", "That time has already passed.")
        if _slot_is_taken(db, new_slot_id):
            raise ServiceError(409, "slot_taken", "That time slot was just taken. Pick another.")
        appointment.slot_id = new_slot_id
        appointment.updated_at = now
        db.flush()
    return appointment


def cancel(db: Session, *, appointment_id: int) -> Appointment:
    now = datetime.now(UTC)
    with _transaction(db):
        appointment = _locked_appointment(db, appointment_id)
        if appointment.status != "booked":
            raise ServiceError(409, "invalid_state", "Only a booked appointment can be cancelled.")
        appointment.status = "cancelled"
        appointment.updated_at = now
        db.flush()
    return appointment
