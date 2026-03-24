from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from ..database import Base


class App(Base):
    __tablename__ = "apps"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    port = Column(Integer, nullable=False, index=True)

    log = relationship("Log", back_populates="app")
    rules = relationship("Rule", back_populates="app")

    def __repr__(self):
        return "<App(%r, %r, %r)>" % (
                self.id, self.name, self.port
            )