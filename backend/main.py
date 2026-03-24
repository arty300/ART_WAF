from fastapi import FastAPI, Depends
from redis import Redis
from sqlmodel import SQLModel, Session, create_engine, Field
from typing import Optional


engine = create_engine("postgresql://postgres:pass@localhost/waf_db")
redis_client = Redis(host='127.0.0.1', port=6379, decode_responses=True)
app = FastAPI()

class Ban(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ip: str = Field(index=True, unique=True)

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

@app.post("/ban")
def ban_ip(ip: str):
    # 1. Сохраняем в Postgres (навсегда)
    with Session(engine) as session:
        new_ban = Ban(ip=ip)
        session.add(new_ban)
        session.commit()
    
    # 2. Дублируем в Redis (для Go) на 24 часа
    redis_client.setex(f"ban:{ip}", 86400, "1")
    return {"status": f"IP {ip} заблокирован"}

@app.delete("/ban")
def unban_ip(ip: str):
    # Удаляем отовсюду
    with Session(engine) as session:
        statement = session.query(Ban).filter(Ban.ip == ip)
        item = statement.first()
        if item:
            session.delete(item)
            session.commit()
    redis_client.delete(f"ban:{ip}")
    return {"status": "unbanned"}
