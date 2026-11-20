from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_staff
from app.models import User
from app.services.insights import build_insights

router = APIRouter()


@router.get("/insights")
def insights(user: User = Depends(require_staff), db: Session = Depends(get_db)) -> dict:
    return build_insights(db)
