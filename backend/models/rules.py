from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from ..database import Base


class Rule(Base):
    __tablename__ = "rules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False, index=True)
    address = Column(String)
    action = Column(String, nullable=False, index=True)
    pattern = Column(String, index=True)

    app_id = Column(Integer, ForeignKey("apps.id"), nullable=False)


    app = relationship("App", back_populates="rules")

    def __repr__(self):
        return "<Rule(%r, %r, %r, %r)>" % (
                self.id, self.name, self.type, self.address
            )