from fastapi import FastAPI, Depends
from redis import Redis
from sqlmodel import SQLModel, Session, create_engine, Field
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .config import settings
from .database import init_db
from .routes import products_router, categories_router, cart_router


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    docs_url='/api/docs',
    redoc_url='/api/redoc'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins = settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(products_router)
app.include_router(categories_router)
app.include_router(cart_router)

@app.on_event('startup')
def on_startup():
    init_db()

@app.get('/')
def root():
    return {
        'message': 'Welcome to fastapi shop API',
        "docs": "api/docs",
    }

@app.get('/health')
def health_check():
    return {'status': 'healthy'}




engine = create_engine(settings.postgresql_url)
redis_client = Redis(host=settings.redis_host, port=settings.redis_port, decode_responses=True)
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



@app.post("/login")
def login(username: str, password: str):
    # Заглушка для авторизации
    if username == "admin" and password == "password":
        return {"status": "success"}
    return {"status": "failure"}
@app.get("/user/me")
def get_user_info():
    return {"status": "user info"}
@app.post("/user/update")
def update_user():
    return {"status": "user updated"}



@app.get("/services/{service_id}")
def get_service_info(service_id: int):
    return {"status": f"info for service {service_id}"}
@app.post("/services/{service_id}/update")
def update_service(service_id: int):
    return {"status": f"service {service_id} updated"}
@app.delete("/services/{service_id}")
def delete_service(service_id: int):
    return {"status": f"service {service_id} deleted"}

@app.get("/logs")
def get_logs():
    return {"status": "logs data"}

@app.get("/rules")
def get_rules():
    return {"status": "rules data"}
@app.post("/rules/{rule_id}/update")
def update_rule(rule_id: int):
    return {"status": f"rule {rule_id} updated"}
@app.delete("/rules/{rule_id}")
def delete_rule(rule_id: int):
    return {"status": f"rule {rule_id} deleted"}
