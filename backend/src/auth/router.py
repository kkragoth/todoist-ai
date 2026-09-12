from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from core.database import get_db

from . import models, schemas
from .utils import security

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register")
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == user_data.username).first()

    if existing:
        raise HTTPException(status_code=400, detail="Username taken")

    user = models.User(
        username=user_data.username, 
        hashed_password=security.hash_password(user_data.password)
    )

    db.add(user)
    db.commit()

    return {"message": "User registered succesfully"}


@router.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect credentials")

    token = security.create_access_token(data={"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}