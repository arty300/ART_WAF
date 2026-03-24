from pydantic import BaseModel, Field


class RuleBase(BaseModel):
    name: str = Field(..., min_length=5, max_length=100,
        description="rule name")
    app_id: int = Field(..., ge=1, description="ID of the app that the rule applies to")
    pattern: str = Field(..., min_length=1, description="Pattern to match in the request")
    action: str = Field(..., min_length=1, description="Action to take when the pattern matches (e.g., 'block', 'allow', 'log')")
    
    

class RuleCreate(RuleBase):
    pass

class RuleResponse(RuleBase):
    id: int = Field(..., description='Unique rule identifier')

    class Config:
        from_attributes = True