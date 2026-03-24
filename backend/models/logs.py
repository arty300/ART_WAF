from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from ..database import Base


class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False, index=True)
    message = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    app_id = Column(Integer, ForeignKey("apps.id"), nullable=False)

    app = relationship("App", back_populates="logs")
    
    def __repr__(self):
        return "<Log(%r, %r, %r, %r)>" % (
                self.id, self.name, self.type, self.message
            )
