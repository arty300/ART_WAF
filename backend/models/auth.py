from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from ..database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)

    def __repr__(self):
        return "<User(%r, %r)>" % (
                self.id, self.username
            )