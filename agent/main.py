"""HTTP service for the Vinylla agent. The Node backend calls POST /agent."""
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

from agent import run_agent  # noqa: E402  (after load_dotenv so the key is read)

app = FastAPI(title="Vinylla agent")


class Message(BaseModel):
    role: str
    content: str


class AgentRequest(BaseModel):
    messages: list[Message]
    cookie: str | None = None


@app.post("/agent")
def agent(req: AgentRequest):
    history = [m.model_dump() for m in req.messages][-12:]
    try:
        return run_agent(history, req.cookie)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
