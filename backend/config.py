from pydantic_settings import BaseSettings
from typing import List, Union

class Settings(BaseSettings):
#general    
    app_name: str = "FastAPI WAF"
    cors_origins: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    debug: bool = True
#database
    postgresql_url: str = "postgresql://postgres:pass@localhost/waf_db"
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
#auth
    secret_key = "16fde6b976b61e2d82b6d907480598ae034818311dd92eac2bd6bd74ab3bda2a"
    alghorithm = "HS256"
    access_token_expire_minutes = 30

    class Config:
        env_file = ".env"

settings = Settings()