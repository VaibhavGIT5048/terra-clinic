import json
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyCount
from app.services.insights import build_insights, forecast

START = date(2026, 1, 5)  # Monday
MONDAYS_BEFORE_START = [date(2025, 12, 8), date(2025, 12, 15), date(2025, 12, 22), date(2025, 12, 29)]
FOUR_MONDAY_VALUES = [10, 20, 30, 40]  # mean 25.0


def test_start_is_monday() -> None:
    assert START.weekday() == 0


# Unit tests for forecast()


def test_forecast_is_mean_of_last_four_same_weekdays() -> None:
    history = dict(zip(MONDAYS_BEFORE_START, FOUR_MONDAY_VALUES, strict=True))

    assert forecast(history, START, days=1) == [(START, 25.0)]


def test_forecast_ignores_fifth_and_older_same_weekday() -> None:
    history = dict(zip(MONDAYS_BEFORE_START, FOUR_MONDAY_VALUES, strict=True))
    history[date(2025, 12, 1)] = 1000

    assert forecast(history, START, days=1) == [(START, 25.0)]


def test_forecast_uses_available_weeks_when_fewer_than_four() -> None:
    history = {date(2025, 12, 22): 30, date(2025, 12, 29): 50}

    assert forecast(history, START, days=1) == [(START, 40.0)]


def test_forecast_without_history_is_zero_for_seven_days() -> None:
    assert forecast({}, START) == [(START + timedelta(days=i), 0.0) for i in range(7)]


def test_forecast_rounds_to_one_decimal() -> None:
    history = dict(zip(MONDAYS_BEFORE_START[1:], [10, 10, 11], strict=True))  # mean 10.333...

    assert forecast(history, START, days=1) == [(START, 10.3)]


def test_forecast_never_uses_the_target_day_itself() -> None:
    history = dict(zip(MONDAYS_BEFORE_START, FOUR_MONDAY_VALUES, strict=True))
    history[START] = 999

    assert forecast(history, START, days=1) == [(START, 25.0)]


def test_forecast_does_not_feed_forecasts_back() -> None:
    history = dict(zip(MONDAYS_BEFORE_START, FOUR_MONDAY_VALUES, strict=True))

    points = forecast(history, START, days=8)

    # Jan 12 must use only real Mondays (Dec 8 to Dec 29), not the forecast for Jan 5.
    assert points[7] == (START + timedelta(days=7), 25.0)


def test_forecast_is_deterministic() -> None:
    history = dict(zip(MONDAYS_BEFORE_START, FOUR_MONDAY_VALUES, strict=True))

    assert forecast(history, START) == forecast(history, START)


# build_insights() against the seeded database


def test_build_insights_history_ends_yesterday_of_given_today(db: Session) -> None:
    last_day = db.scalar(select(DailyCount.day).order_by(DailyCount.day.desc()).limit(1))

    body = build_insights(db, today=last_day + timedelta(days=1))

    assert len(body["history"]) == 30
    assert body["history"][-1]["day"] == last_day.isoformat()


# Endpoint tests


def test_insights_without_login_is_401(client: TestClient) -> None:
    response = client.get("/api/insights")

    assert response.status_code == 401


def test_insights_patient_is_403(login) -> None:
    response = login("patient").get("/api/insights")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


@pytest.mark.parametrize("role", ["receptionist", "admin"])
def test_insights_staff_gets_200(login, role: str) -> None:
    response = login(role).get("/api/insights")

    assert response.status_code == 200


def test_insights_response_shape(login) -> None:
    body = login("admin").get("/api/insights").json()
    today = datetime.now(UTC).date()

    assert body["window_days"] == 30
    assert body["forecast"]["label"] == "Demo forecast"
    assert body["forecast"]["method"] == (
        "Mean of the same weekday over the previous 4 weeks (booked appointments)"
    )

    history = body["history"]
    assert len(history) == 30
    assert [row["day"] for row in history] == sorted(row["day"] for row in history)
    assert history[0]["day"] == (today - timedelta(days=30)).isoformat()
    assert history[-1]["day"] == (today - timedelta(days=1)).isoformat()
    assert set(history[0]) == {"day", "booked", "completed", "cancelled", "no_show"}

    points = body["forecast"]["points"]
    assert len(points) == 7
    assert points[0]["day"] == (today + timedelta(days=1)).isoformat()
    assert set(points[0]) == {"day", "predicted_booked"}


def test_insights_history_matches_database(login, db: Session) -> None:
    body = login("admin").get("/api/insights").json()
    today = datetime.now(UTC).date()
    expected = db.scalars(
        select(DailyCount)
        .where(DailyCount.day >= today - timedelta(days=30), DailyCount.day < today)
        .order_by(DailyCount.day)
    ).all()

    assert [(row["day"], row["booked"], row["cancelled"]) for row in body["history"]] == [
        (row.day.isoformat(), row.booked, row.cancelled) for row in expected
    ]


def test_insights_totals_and_rates(login) -> None:
    body = login("admin").get("/api/insights").json()
    rows = body["history"]
    totals = body["totals"]

    for key in ("booked", "completed", "cancelled", "no_show"):
        assert totals[key] == sum(row[key] for row in rows)
    assert totals["booked"] > 0
    assert totals["cancellation_rate"] == round(totals["cancelled"] / totals["booked"], 3)
    assert totals["no_show_rate"] == round(totals["no_show"] / totals["booked"], 3)


def test_insights_forecast_uses_all_sixty_days(login, db: Session) -> None:
    body = login("admin").get("/api/insights").json()
    today = datetime.now(UTC).date()
    all_rows = db.scalars(select(DailyCount)).all()
    expected = forecast({row.day: row.booked for row in all_rows}, today + timedelta(days=1))

    assert [(p["day"], p["predicted_booked"]) for p in body["forecast"]["points"]] == [
        (day.isoformat(), value) for day, value in expected
    ]


def test_insights_strings_never_mention_chronos(login) -> None:
    body = login("admin").get("/api/insights").json()

    assert "chronos" not in json.dumps(body).lower()
