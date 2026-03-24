from pydantic import BaseModel, Field


class AppBase(BaseModel):
    name: str = Field(..., min_length=5, max_length=100,
        description="App name")
    port: int = Field(..., ge=1, le=65535,
        description="Port number the app is running on")
    

class AppCreate(AppBase):
    pass

class AppResponse(AppBase):
    id: int = Field(..., description='Unique app identifier')

    class Config:
        from_attributes = True