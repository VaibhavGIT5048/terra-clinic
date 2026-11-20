from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import ClinicGuide, User

router = APIRouter(prefix="/guides", tags=["guides"])


class GuideSummary(BaseModel):
    slug: str
    title: str


class GuideOut(GuideSummary):
    body: str


@router.get("", response_model=list[GuideSummary])
def list_guides(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    guides = db.scalars(select(ClinicGuide).order_by(ClinicGuide.id)).all()
    return [{"slug": g.slug, "title": g.title} for g in guides]


@router.get("/{slug}", response_model=GuideOut)
def get_guide(slug: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    guide = db.scalar(select(ClinicGuide).where(ClinicGuide.slug == slug))
    if guide is None:
        raise HTTPException(404, detail={"code": "guide_not_found", "message": "That guide does not exist."})
    return {"slug": guide.slug, "title": guide.title, "body": guide.body}
