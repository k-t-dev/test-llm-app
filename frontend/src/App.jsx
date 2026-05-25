import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import kaitoPicture from "../utils/kaito-picture.jpg";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

const DEFAULT_SECTIONS = [
  { id: 1, title: "職歴・経歴",    content: "" },
  { id: 2, title: "スキル・専門知識", content: "" },
  { id: 3, title: "価値観・考え方", content: "" },
  { id: 4, title: "趣味・興味",    content: "" },
];

const SUGGESTED_QUESTIONS = [
  "あなたの経歴を教えてください",
  "得意なスキルは何ですか？",
  "仕事への考え方や価値観は？"
];

async function apiFetch(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export default function App() {
  const backendUrl = DEFAULT_BACKEND_URL;
  const [backendStatus, setBackendStatus] = useState("unknown");

  const [sections, setSections]       = useState(DEFAULT_SECTIONS);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [retrievedCtx, setRetrievedCtx] = useState([]);
  const [showCtx, setShowCtx]         = useState(false);

  const [activeTab, setActiveTab]     = useState("chat");
  const [profileUnlocked, setProfileUnlocked] = useState(false);
  const [pwInput, setPwInput]         = useState("");
  const [pwError, setPwError]         = useState(false);
  const messagesEndRef                = useRef(null);

  useEffect(() => {
    apiFetch(backendUrl, "/api/health")
      .then(() => setBackendStatus("ok"))
      .catch(() => setBackendStatus("error"));
  }, [backendUrl]);

  useEffect(() => {
    if (backendStatus !== "ok") return;
    apiFetch(backendUrl, "/api/profile")
      .then((data) => {
        if (data.sections?.length > 0) setSections(data.sections);
      })
      .catch(() => {});
  }, [backendStatus, backendUrl]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addSection    = () => setSections((p) => [...p, { id: Date.now(), title: "新しいセクション", content: "" }]);
  const removeSection = (id) => setSections((p) => p.filter((s) => s.id !== id));
  const updateSection = (id, field, val) =>
    setSections((p) => p.map((s) => (s.id === id ? { ...s, [field]: val } : s)));

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      await apiFetch(backendUrl, "/api/profile", {
        method: "POST",
        body: JSON.stringify({ sections }),
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (e) {
      alert(`保存エラー: ${e.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading || backendStatus === "error") return;

    const userMsg = input.trim();
    setInput("");
    setMessages((p) => [...p, { role: "user", content: userMsg }]);
    setLoading(true);
    setRetrievedCtx([]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const data = await apiFetch(backendUrl, "/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: userMsg, history }),
      });
      setRetrievedCtx(data.context_chunks || []);
      setMessages((p) => [...p, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: `⚠️ エラー: ${err.message}`, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => { setMessages([]); setRetrievedCtx([]); };

  const profileFilled = sections.some((s) => s.content.trim().length > 0);

  const colors = {
    primary: "#4f46e5",
    primaryGrad: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    bg: "#f0f2f5",
    card: "white",
    border: "#e5e7eb",
    text: "#1f2937",
    muted: "#6b7280",
    success: "#16a34a",
    successBg: "#f0fdf4",
    error: "#dc2626",
    errorBg: "#fef2f2",
  };

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',sans-serif", minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column" }}>

      <header style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81)", color: "white", padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={kaitoPicture} alt="kaito" style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }} />
          <div>
            <div style={{ fontWeight: "800", fontSize: "16px" }}>My RAG Assistant</div>
            <div style={{ fontSize: "11px", opacity: 0.65 }}>個人プロフィール × RAG</div>
          </div>
        </div>
      </header>

      <div style={{ background: "white", borderBottom: `1px solid ${colors.border}`, display: "flex", padding: "0 20px" }}>
        {[["chat","💬 チャット"], ["profile", `📝 RAG追加${profileFilled ? " ✅" : ""}`], ["env","💻 環境"]].map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "12px 18px", border: "none", background: "none", cursor: "pointer",
            fontSize: "13px", fontWeight: activeTab === tab ? "700" : "500",
            color: activeTab === tab ? colors.primary : colors.muted,
            borderBottom: activeTab === tab ? `2px solid ${colors.primary}` : "2px solid transparent",
            transition: "color 0.15s",
          }}>
            {label}
          </button>
        ))}
      </div>

      <main style={{ flex: 1, maxWidth: "860px", width: "100%", margin: "0 auto", padding: "20px 16px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>

        {activeTab === "env" && (
          <div style={{ background: colors.card, borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: `1px solid ${colors.border}` }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "17px", fontWeight: "700" }}>💻 環境</h2>
            <div style={{ fontSize: "14px", lineHeight: 1.8, color: colors.text }}>
              <ReactMarkdown>{`
## フロントエンド

- **フレームワーク**: React (Vite)
- **スタイリング**: インラインスタイル
- **Markdown レンダリング**: react-markdown

## バックエンド

- **フレームワーク**: FastAPI (Python)
- **LLM**: Gemini 2.5 Flash (Google Generative AI)
- **RAG**: FAISS + sentence-transformers (multilingual-e5-small)

## 構成

\`\`\`
llm_git/
├── frontend/        # React アプリ
│   ├── src/App.jsx
│   └── utils/
└── backend/         # FastAPI サーバー
    ├── main.py      # API エンドポイント
    ├── rag.py       # RAG 検索ロジック
    └── profile.json # プロフィールデータ
\`\`\`
              `}</ReactMarkdown>
            </div>
          </div>
        )}

        {activeTab === "profile" && !profileUnlocked && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "320px" }}>
            <div style={{ background: colors.card, borderRadius: "16px", padding: "36px 40px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", border: `1px solid ${colors.border}`, textAlign: "center", width: "100%", maxWidth: "360px" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔒</div>
              <h2 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: "700" }}>パスワードが必要です</h2>
              <p style={{ margin: "0 0 20px", color: colors.muted, fontSize: "13px" }}>プロフィールを表示するにはパスワードを入力してください。</p>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (pwInput === "Kaito39") {
                  setProfileUnlocked(true);
                  setPwError(false);
                  setPwInput("");
                } else {
                  setPwError(true);
                  setPwInput("");
                }
              }}>
                <input
                  type="password"
                  value={pwInput}
                  onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
                  placeholder="パスワード"
                  autoFocus
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${pwError ? colors.error : colors.border}`, fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "8px" }}
                />
                {pwError && (
                  <p style={{ margin: "0 0 10px", color: colors.error, fontSize: "12px" }}>パスワードが違います</p>
                )}
                <button type="submit"
                  style={{ width: "100%", background: colors.primaryGrad, color: "white", border: "none", borderRadius: "10px", padding: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
                  確認
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === "profile" && profileUnlocked && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>プロフィール情報</h2>
                <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: "13px" }}>
                  「保存」でバックエンドに送信し、RAG インデックスを再構築します。
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={addSection}
                  style={{ background: colors.primary, color: "white", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" }}>
                  ＋ セクション追加
                </button>
                <button onClick={saveProfile} disabled={profileSaving}
                  style={{ background: profileSaved ? colors.success : "#059669", color: "white", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: profileSaving ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", opacity: profileSaving ? 0.7 : 1 }}>
                  {profileSaving ? "保存中…" : profileSaved ? "✓ 保存完了" : "💾 保存"}
                </button>
                <button onClick={() => setProfileUnlocked(false)}
                  style={{ background: "#f3f4f6", color: colors.muted, border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" }}>
                  🔒 ロック
                </button>
              </div>
            </div>

            {sections.map((sec) => (
              <div key={sec.id} style={{ background: colors.card, borderRadius: "12px", padding: "18px", marginBottom: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: `1px solid ${colors.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <input value={sec.title} onChange={(e) => updateSection(sec.id, "title", e.target.value)}
                    style={{ flex: 1, fontSize: "14px", fontWeight: "700", border: "none", borderBottom: `2px solid ${colors.border}`, padding: "2px 0 4px", outline: "none", background: "transparent", color: colors.text }} />
                  <button onClick={() => removeSection(sec.id)}
                    style={{ background: colors.errorBg, color: colors.error, border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                    削除
                  </button>
                </div>
                <textarea value={sec.content} onChange={(e) => updateSection(sec.id, "content", e.target.value)}
                  placeholder={`${sec.title}について詳しく書いてください...`} rows={5}
                  style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "10px 12px", fontSize: "14px", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: colors.text }} />
                <div style={{ textAlign: "right", fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                  {sec.content.length.toLocaleString()} 文字
                </div>
              </div>
            ))}

            <div style={{ background: colors.successBg, border: "1px solid #bbf7d0", borderRadius: "12px", padding: "14px 18px", display: "flex", gap: "10px" }}>
              <span style={{ fontSize: "18px" }}>💡</span>
              <div style={{ fontSize: "13px", color: "#15803d", lineHeight: 1.6 }}>
                <strong>ヒント：</strong>具体的なエピソードや数字を含めると、AIがより詳しく回答できます。
                <br />入力後は「💾 保存」を押してから「チャット」タブで試してみましょう！
              </div>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", color: colors.muted }}>
                {backendStatus === "ok"
                  ? `🖥 Backend 接続済み | ${sections.filter((s) => s.content.trim()).length} セクション`
                  : "⚠️ Backend 未接続"}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {retrievedCtx.length > 0 && (
                  <button onClick={() => setShowCtx((v) => !v)}
                    style={{ background: "#ede9fe", color: "#6d28d9", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" }}>
                    {showCtx ? "コンテキストを隠す" : `🔍 取得コンテキスト (${retrievedCtx.length})`}
                  </button>
                )}
                {messages.length > 0 && (
                  <button onClick={clearChat}
                    style={{ background: "#f3f4f6", color: colors.muted, border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" }}>
                    🗑 クリア
                  </button>
                )}
              </div>
            </div>

            {showCtx && retrievedCtx.length > 0 && (
              <div style={{ background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: "10px", padding: "12px 14px", marginBottom: "10px", fontSize: "12px", color: "#5b21b6" }}>
                <div style={{ fontWeight: "700", marginBottom: "6px" }}>🔍 RAG 取得チャンク (score 順)</div>
                {retrievedCtx.map((c, i) => (
                  <div key={i} style={{ marginBottom: "5px", padding: "6px 10px", background: "white", borderRadius: "6px", border: "1px solid #ede9fe", display: "flex", justifyContent: "space-between", gap: "8px" }}>
                    <span><span style={{ fontWeight: "700" }}>【{c.title}】</span> {c.content.slice(0, 80)}{c.content.length > 80 ? "…" : ""}</span>
                    <span style={{ whiteSpace: "nowrap", color: "#7c3aed", fontWeight: "600" }}>
                      {typeof c.score === "number" ? c.score.toFixed(3) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", background: colors.card, borderRadius: "12px", padding: "18px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: `1px solid ${colors.border}`, minHeight: "320px", maxHeight: "calc(100vh - 380px)" }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
                  <img src={kaitoPicture} alt="kaito" style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", marginBottom: "12px" }} />
                  <div style={{ fontSize: "15px", fontWeight: "700", color: colors.text, marginBottom: "6px" }}>何でも聞いてください</div>
                  <div style={{ fontSize: "13px", marginBottom: "22px" }}>
                    プロフィールタブで経歴・考え方を入力してから質問すると<br />AI があなたの情報をもとに回答します。
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button key={q} onClick={() => setInput(q)}
                        style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "20px", padding: "7px 14px", cursor: "pointer", fontSize: "12px", color: "#6d28d9", fontWeight: "500" }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ marginBottom: "14px", display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: "8px" }}>
                      {msg.role === "assistant" && (
                        <img src={kaitoPicture} alt="kaito" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      )}
                      <div style={{
                        maxWidth: "72%", padding: "11px 15px",
                        borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        background: msg.role === "user" ? colors.primaryGrad : msg.error ? colors.errorBg : "#f9fafb",
                        color: msg.role === "user" ? "white" : msg.error ? colors.error : colors.text,
                        fontSize: "14px", lineHeight: 1.7,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      }}>
                        {msg.role === "user" ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                      </div>
                      {msg.role === "user" && (
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>👤</div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                      <img src={kaitoPicture} alt="kaito" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover" }} />
                      <div style={{ background: "#f9fafb", padding: "13px 16px", borderRadius: "18px 18px 18px 4px", display: "flex", gap: "5px" }}>
                        {[0, 1, 2].map((j) => (
                          <span key={j} style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#a5b4fc", display: "inline-block", animation: "bounce 1.2s infinite", animationDelay: `${j * 0.18}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={backendStatus === "error" ? "バックエンドに接続できません" : "質問を入力して Enter または 送信..."}
                disabled={backendStatus === "error" || loading}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: "12px",
                  border: `1px solid ${colors.border}`, fontSize: "14px", outline: "none",
                  background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              />
              <button type="submit"
                disabled={!input.trim() || loading || backendStatus === "error"}
                style={{
                  background: input.trim() && !loading ? colors.primaryGrad : "#e5e7eb",
                  color: input.trim() && !loading ? "white" : "#9ca3af",
                  border: "none", borderRadius: "12px", padding: "12px 20px",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  fontSize: "14px", fontWeight: "700", transition: "all 0.2s", whiteSpace: "nowrap",
                }}>
                送信 ↑
              </button>
            </form>
          </div>
        )}
      </main>

      <style>{`
        @keyframes bounce {
          0%,60%,100% { transform: translateY(0); opacity: .7; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        input:focus, textarea:focus { border-color: #a5b4fc !important; }
        button:hover:not(:disabled) { opacity: .88; }
      `}</style>
    </div>
  );
}
