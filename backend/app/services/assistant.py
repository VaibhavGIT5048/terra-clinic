"""Assistant orchestration: builds the provider context, stores proposals, runs confirmed actions.

The provider only proposes. A proposal is stored as a `pending` assistant_action. The only moves
are handle_message (creates pending), confirm (pending -> confirmed, then runs the appointment
service) and dismiss (pending -> dismissed). Each move is guarded by an UPDATE ... WHERE
status='pending' RETURNING, so two confirms of one action cannot both run.
"""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.deps import STAFF_ROLES
from app.models import Appointment, AssistantAction, ClinicGuide, Doctor, Slot, User
from app.services.appointments import book, cancel, reschedule
from app.services.assistant_provider import (
    AppointmentRef,
    AssistantContext,
    AssistantProvider,
    DoctorRef,
    FreeSlot,
    GuideRef,
    ProviderResult,
    RuleBasedProvider,
)
from app.services.errors import ServiceError


def get_provider() -> AssistantProvider:
    return RuleBasedProvider()


def build_context(db: Session, user: User) -> AssistantContext:
    now = datetime.now(UTC)
    guides = [
        GuideRef(slug=g.slug, title=g.title, body=g.body)
        for g in db.scalars(select(ClinicGuide).order_by(ClinicGuide.id))
    ]
    doctors = [DoctorRef(id=d.id, name=d.name, specialty=d.specialty) for d in db.scalars(select(Doctor).order_by(Doctor.id))]
    rows = db.execute(
        select(Appointment.id, Appointment.slot_id, Slot.starts_at, Doctor.id, Doctor.name, Doctor.specialty)
        .join(Slot, Appointment.slot_id == Slot.id)
        .join(Doctor, Slot.doctor_id == Doctor.id)
        .where(Appointment.patient_id == user.id, Appointment.status.in_(["booked"]), Slot.starts_at > now)
        .order_by(Slot.starts_at, Appointment.id)
    ).all()
    upcoming = [
        AppointmentRef(
            id=r[0], slot_id=r[1], starts_at=r[2], doctor_id=r[3], doctor_name=r[4], specialty=r[5]
        )
        for r in rows
    ]

    def earliest_free_slot(doctor_id: int) -> FreeSlot | None:
        booked = select(Appointment.slot_id).where(Appointment.status.in_(["booked"]))
        row = db.execute(
            select(Slot.id, Slot.doctor_id, Slot.starts_at)
            .where(Slot.doctor_id == doctor_id, Slot.starts_at > now, Slot.id.not_in(booked))
            .order_by(Slot.starts_at, Slot.id)
            .limit(1)
        ).first()
        return None if row is None else FreeSlot(id=row[0], doctor_id=row[1], starts_at=row[2])

    return AssistantContext(
        user_id=user.id,
        guides=guides,
        doctors=doctors,
        upcoming=upcoming,
        earliest_free_slot=earliest_free_slot,
    )


def handle_message(db: Session, user: User, message: str) -> tuple[ProviderResult, AssistantAction | None]:
    result = get_provider().reply(message, build_context(db, user))
    if result.proposed_action is None:
        return result, None

    # Lock the user row so two concurrent proposals cannot both leave a pending action behind.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    db.execute(
        update(AssistantAction)
        .where(AssistantAction.user_id == user.id, AssistantAction.status.in_(["pending"]))
        .values(status="dismissed")
        .execution_options(synchronize_session=False)
    )
    proposal = result.proposed_action
    action = AssistantAction(
        user_id=user.id,
        type=proposal["type"],
        params=proposal["params"],
        summary=proposal["summary"],
        status="pending",
    )
    db.add(action)
    db.commit()
    return result, action


def _raise_not_claimable(db: Session, user: User, action_id: int) -> None:
    owner_id = db.execute(select(AssistantAction.user_id).where(AssistantAction.id == action_id)).scalar_one_or_none()
    if owner_id is None or owner_id != user.id:
        raise ServiceError(404, "action_not_found", "That action does not exist.")
    raise ServiceError(409, "invalid_state", "This action has already been confirmed, dismissed or failed.")


def _claim(db: Session, user: User, action_id: int):
    return db.execute(
        update(AssistantAction)
        .where(
            AssistantAction.id == action_id,
            AssistantAction.user_id == user.id,
            AssistantAction.status.in_(["pending"]),
        )
        .values(status="confirmed")
        .returning(AssistantAction.type, AssistantAction.params)
        .execution_options(synchronize_session=False)
    ).one_or_none()


def _mark_failed(db: Session, action_id: int) -> None:
    db.execute(
        update(AssistantAction)
        .where(AssistantAction.id == action_id, AssistantAction.status.in_(["pending"]))
        .values(status="failed")
        .execution_options(synchronize_session=False)
    )
    db.commit()


def _run(db: Session, user: User, action_type: str, params: dict) -> Appointment:
    if action_type == "book":
        return book(db, patient_id=user.id, slot_id=params["slot_id"], reason=params["reason"])
    if action_type == "reschedule":
        return reschedule(db, appointment_id=params["appointment_id"], new_slot_id=params["slot_id"])
    if action_type == "cancel":
        return cancel(db, appointment_id=params["appointment_id"])
    raise RuntimeError(f"unknown assistant action type: {action_type}")


def confirm(db: Session, user: User, action_id: int) -> Appointment:
    claimed = _claim(db, user, action_id)
    if claimed is None:
        _raise_not_claimable(db, user, action_id)
    action_type, params = claimed

    if action_type in ("cancel", "reschedule") and user.role not in STAFF_ROLES:
        owner_id = db.scalar(select(Appointment.patient_id).where(Appointment.id == params["appointment_id"]))
        if owner_id != user.id:
            db.rollback()  # undoes the claim: the action stays pending
            raise ServiceError(403, "forbidden", "You can only change your own appointments.")

    try:
        return _run(db, user, action_type, params)
    except ServiceError:
        db.rollback()
        _mark_failed(db, action_id)
        raise
    except BaseException:
        db.rollback()
        raise


def dismiss(db: Session, user: User, action_id: int) -> None:
    dismissed = db.execute(
        update(AssistantAction)
        .where(
            AssistantAction.id == action_id,
            AssistantAction.user_id == user.id,
            AssistantAction.status.in_(["pending"]),
        )
        .values(status="dismissed")
        .returning(AssistantAction.id)
        .execution_options(synchronize_session=False)
    ).one_or_none()
    if dismissed is None:
        _raise_not_claimable(db, user, action_id)
    db.commit()
