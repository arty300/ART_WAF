from pydantic import BaseModel, Field


class LogBase(BaseModel):
    name: str = Field(..., min_length=5, max_length=100,
        description="log name")
    app_id: int = Field(..., ge=1, description="ID of the app that generated the log")
    message: str = Field(..., min_length=1, description="Log message")
    type: str = Field(..., min_length=1, description="Log type (e.g., 'error', 'info', 'warning')")
    

class LogCreate(LogBase):
    pass

class LogResponse(LogBase):
    id: int = Field(..., description='Unique log identifier')

    class Config:
        from_attributes = True