import os
import json
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from typing import Optional, List

import google.generativeai as genai

from rag import build_index, load_index, search_rag

# =========================
# ENV
# =========================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)

# =========================
# PROFILE STORAGE
# =========================
PROFILE_FILE = "profile.json"

DEFAULT_SECTIONS = [
    {"id": 1, "title": "職歴・経歴",    "content": ""},
    {"id": 2, "title": "スキル・専門知識", "content": ""},
    {"id": 3, "title": "価値観・考え方", "content": ""},
    {"id": 4, "title": "趣味・興味",    "content": ""},
]


def load_profile():
    if os.path.exists(PROFILE_FILE):
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists("profile.txt"):
        with open("profile.txt", "r", encoding="utf-8") as f:
            content = f.read()
        return {"sections": [{"id": 1, "title": "プロフィール", "content": content}]}
    return {"sections": DEFAULT_SECTIONS}


def save_profile(sections):
    with open(PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump({"sections": sections}, f, ensure_ascii=False, indent=2)


# =========================
# STARTUP: load index
# =========================
load_index()

if not os.path.exists("faiss_index/profile.index"):
    data = load_profile()
    build_index(data.get("sections", []))

# =========================
# FASTAPI
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# REQUEST MODELS
# =========================
class ProfileRequest(BaseModel):
    sections: list


class HistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[HistoryItem]] = []
    api_key: Optional[str] = None
    model: Optional[str] = "gemini-2.5-flash"

# =========================
# HEALTH
# =========================
@app.get("/api/health")
def health():
    return {"status": "ok"}

# =========================
# PROFILE API
# =========================
@app.get("/api/profile")
def get_profile():
    return load_profile()


@app.post("/api/profile")
def update_profile(req: ProfileRequest):
    save_profile(req.sections)
    build_index(req.sections)
    return {"sections": req.sections}

# =========================
# CHAT API
# =========================
@app.post("/api/chat")
def chat(req: ChatRequest):
    context_chunks = search_rag(req.message)

    if context_chunks:
        ctx_text = "\n\n".join(
            f"【{c['title']}】\n{c['content']}" for c in context_chunks
        )
        system = (
            "あなたは以下のプロフィール情報をもとに質問に回答するアシスタントです。\n"
            "一人称で答え、情報にない内容は「その情報は持ち合わせていません」と伝えてください。\n\n"
            f"=== プロフィール情報 ===\n{ctx_text}"
        )
    else:
        system = "あなたは個人プロフィールアシスタントです。まだプロフィール情報が入力されていません。"

    history_text = ""
    for h in req.history:
        role_label = "ユーザー" if h.role == "user" else "アシスタント"
        history_text += f"{role_label}: {h.content}\n"

    prompt = f"{system}\n\n{history_text}ユーザー: {req.message}\nアシスタント:"

    gemini = genai.GenerativeModel("gemini-2.5-flash")
    response = gemini.generate_content(prompt)

    return {"reply": response.text, "context_chunks": context_chunks}

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {"message": "RAG API Running"}
