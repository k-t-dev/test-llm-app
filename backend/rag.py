import os
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

INDEX_DIR = "faiss_index"
INDEX_FILE = f"{INDEX_DIR}/profile.index"
DOC_FILE = f"{INDEX_DIR}/documents.npy"

os.makedirs(INDEX_DIR, exist_ok=True)

embedding_model = SentenceTransformer("intfloat/multilingual-e5-small")

_index = None
_documents = []  # list of {"title": str, "content": str}


def build_index(sections):
    global _index, _documents
    _documents = []
    for sec in sections:
        content = sec.get("content", "").strip()
        if not content:
            continue
        paras = [p.strip() for p in content.split("\n\n") if p.strip()]
        if not paras:
            paras = [content]
        for para in paras:
            _documents.append({"title": sec.get("title", ""), "content": para})

    if not _documents:
        _index = None
        return

    texts = [f"passage: 【{d['title']}】 {d['content']}" for d in _documents]
    embeddings = embedding_model.encode(texts, normalize_embeddings=True)
    dim = embeddings.shape[1]
    _index = faiss.IndexFlatIP(dim)
    _index.add(np.array(embeddings).astype("float32"))

    faiss.write_index(_index, INDEX_FILE)
    np.save(DOC_FILE, _documents)


def load_index():
    global _index, _documents
    if os.path.exists(INDEX_FILE) and os.path.exists(DOC_FILE):
        _index = faiss.read_index(INDEX_FILE)
        _documents = np.load(DOC_FILE, allow_pickle=True).tolist()


def search_rag(query, k=4):
    if _index is None or not _documents:
        return []
    query_embedding = embedding_model.encode(
        [f"query: {query}"], normalize_embeddings=True
    )
    scores, indices = _index.search(
        np.array(query_embedding).astype("float32"),
        min(k, len(_documents)),
    )
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx >= 0:
            doc = _documents[idx]
            results.append({
                "title": doc["title"],
                "content": doc["content"],
                "score": float(score),
            })
    return results
