from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyCount

HISTORY_DAYS = 30
FORECAST_DAYS = 7
FORECAST_WEEKS = 4
FORECAST_LABEL = "Demo forecast"
FORECAST_METHOD = "Mean of the same weekday over the previous 4 weeks (booked appointments)"


def forecast(history_by_day: dict[date, int], start: date, days: int = FORECAST_DAYS) -> list[tuple[date, float]]:
    points: list[tuple[date, float]] = []
    for offset in range(days):
        target = start + timedelta(days=offset)
        prior = sorted((d for d in history_by_day if d < target and d.weekday() == target.weekday()), reverse=True)
        recent = prior[:FORECAST_WEEKS]
        value = sum(history_by_day[d] for d in recent) / len(recent) if recent else 0.0
        points.append((target, round(value, 1)))
    return points


def _rate(part: int, booked: int) -> float:
    return round(part / booked, 3) if booked else 0.0


def build_insights(db: Session, today: date | None = None) -> dict:
    today = today or datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)
    window_start = today - timedelta(days=HISTORY_DAYS)

    rows = db.scalars(select(DailyCount).order_by(DailyCount.day)).all()
    history = [row for row in rows if window_start <= row.day <= yesterday]

    booked = sum(row.booked for row in history)
    cancelled = sum(row.cancelled for row in history)
    no_show = sum(row.no_show for row in history)
    totals = {
        "booked": booked,
        "completed": sum(row.completed for row in history),
        "cancelled": cancelled,
        "no_show": no_show,
        "cancellation_rate": _rate(cancelled, booked),
        "no_show_rate": _rate(no_show, booked),
    }

    points = forecast({row.day: row.booked for row in rows}, today + timedelta(days=1))

    return {
        "totals": totals,
        "window_days": HISTORY_DAYS,
        "history": [
            {
                "day": row.day.isoformat(),
                "booked": row.booked,
                "completed": row.completed,
                "cancelled": row.cancelled,
                "no_show": row.no_show,
            }
            for row in history
        ],
        "forecast": {
            "label": FORECAST_LABEL,
            "method": FORECAST_METHOD,
            "points": [{"day": day.isoformat(), "predicted_booked": value} for day, value in points],
        },
    }
