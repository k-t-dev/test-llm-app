/**
 * My RAG Assistant — React フロントエンド (バックエンド対応版)
 *
 * モード切替:
 *   - "backend" … Python バックエンド (/api/*) 経由で動作
 *   - "direct"  … OpenAI API をブラウザから直接呼び出す (バックエンド不要)
 *
 * バックエンド起動方法:
 *   pip install -r requirements.txt
 *   python rag_backend.py          → http://localhost:8000
 */

import { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────
// 設定定数
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// クライアントサイド RAG (direct モード用)
// ─────────────────────────────────────────────────────────────────
function scoreChunk(text, query) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const lower = text.toLowerCase();
  return words.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
}

function retrieveLocal(sections, query, topK = 4) {
  const chunks = [];
  for (const sec of sections) {
    if (!sec.content.trim()) continue;
    const paras = sec.content.split(/\n+/).filter((p) => p.trim());
    paras.forEach((p) => chunks.push({ title: sec.title, content: p, score: 0 }));
    if (paras.length > 1) chunks.push({ title: sec.title, content: sec.content, score: 0 });
  }
  const scored = chunks
    .map((c) => ({ ...c, score: scoreChunk(c.title + " " + c.content, query) }))
    .sort((a, b) => b.score - a.score);
  const hits = scored.filter((c) => c.score > 0).slice(0, topK);
  return hits.length > 0 ? hits : scored.slice(0, topK);
}

async function callOpenAIDirect(apiKey, messages, model) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1200 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return (await res.json()).choices[0].message.content;
}

// ─────────────────────────────────────────────────────────────────
// バックエンド API クライアント
// ─────────────────────────────────────────────────────────────────
async function apiFetch(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── 設定 ────────────────────────────────────────────────────────
  const [mode, setMode]               = useState("backend"); // "backend" | "direct"
  const [backendUrl, setBackendUrl]   = useState(DEFAULT_BACKEND_URL);
  const [apiKey, setApiKey]           = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [model, setModel]             = useState("gpt-4o-mini");
  const [backendStatus, setBackendStatus] = useState("unknown"); // "ok" | "error" | "unknown"

  // ── プロフィール ─────────────────────────────────────────────────
  const [sections, setSections]       = useState(DEFAULT_SECTIONS);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  // ── チャット ─────────────────────────────────────────────────────
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [retrievedCtx, setRetrievedCtx] = useState([]);
  const [showCtx, setShowCtx]         = useState(false);

  // ── UI ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState("chat");
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef                = useRef(null);

  // ── バックエンド疎通確認 ─────────────────────────────────────────
  const checkBackend = useCallback(async () => {
    if (mode !== "backend") return;
    try {
      await apiFetch(backendUrl, "/api/health");
      setBackendStatus("ok");
    } catch {
      setBackendStatus("error");
    }
  }, [mode, backendUrl]);

  useEffect(() => { checkBackend(); }, [checkBackend]);

  // バックエンド接続時にプロフィールを取得
  useEffect(() => {
    if (mode !== "backend" || backendStatus !== "ok") return;
    apiFetch(backendUrl, "/api/profile")
      .then((data) => {
        if (data.sections?.length > 0) {
          setSections(data.sections);
        }
      })
      .catch(() => {});
  }, [backendStatus, mode, backendUrl]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── プロフィール操作 ─────────────────────────────────────────────
  const addSection    = () => setSections((p) => [...p, { id: Date.now(), title: "新しいセクション", content: "" }]);
  const removeSection = (id) => setSections((p) => p.filter((s) => s.id !== id));
  const updateSection = (id, field, val) =>
    setSections((p) => p.map((s) => (s.id === id ? { ...s, [field]: val } : s)));

  /** プロフィールをバックエンドに保存 */
  const saveProfileToBackend = async () => {
    if (mode !== "backend") return;
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

  // ── チャット送信 ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    if (mode === "direct" && !apiKey) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((p) => [...p, { role: "user", content: userMsg }]);
    setLoading(true);
    setRetrievedCtx([]);

    try {
      let reply = "";
      let ctxChunks = [];

      if (mode === "backend") {
        // ── バックエンドモード ──────────────────────────────────────
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const data = await apiFetch(backendUrl, "/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: userMsg,
            history,
            api_key: apiKey || undefined,
            model,
          }),
        });
        reply     = data.reply;
        ctxChunks = data.context_chunks || [];

      } else {
        // ── ダイレクトモード (クライアント RAG) ─────────────────────
        ctxChunks = retrieveLocal(sections, userMsg);

        const ctxText = ctxChunks.length > 0
          ? ctxChunks.map((c) => `【${c.title}】\n${c.content}`).join("\n\n")
          : sections.filter((s) => s.content.trim()).map((s) => `【${s.title}】\n${s.content}`).join("\n\n");

        const sysPrompt = ctxText
          ? `あなたは以下のプロフィール情報をもとに質問に回答するアシスタントです。\n一人称で答え、情報にない内容は「その情報は持ち合わせていません」と伝えてください。\n\n=== プロフィール情報 ===\n${ctxText}`
          : "あなたは個人プロフィールアシスタントです。まだプロフィール情報が入力されていません。";

        const apiMsgs = [
          { role: "system", content: sysPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMsg },
        ];
        reply = await callOpenAIDirect(apiKey, apiMsgs, model);
      }

      setRetrievedCtx(ctxChunks);
      setMessages((p) => [...p, { role: "assistant", content: reply }]);
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

  // ─────────────────────────────────────────────────────────────────
  // スタイル定数
  // ─────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────
  // レンダリング
  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',sans-serif", minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column" }}>

      {/* ══════════════════════ ヘッダー ══════════════════════ */}
      <header style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81)", color: "white", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "26px" }}>🧠</span>
          <div>
            <div style={{ fontWeight: "800", fontSize: "16px" }}>My RAG Assistant</div>
            <div style={{ fontSize: "11px", opacity: 0.65 }}>個人プロフィール × OpenAI RAG</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* モード切替 */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.1)", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)" }}>
            {[["backend","🖥 Backend"],["direct","⚡ Direct"]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "5px 12px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600",
                background: mode === m ? "rgba(255,255,255,0.25)" : "transparent",
                color: "white", transition: "background 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* モデル */}
          <select value={model} onChange={(e) => setModel(e.target.value)}
            style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "8px", padding: "5px 10px", fontSize: "12px", cursor: "pointer" }}>
            <option value="gpt-4o-mini">GPT-4o mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>

          {/* API キー */}
          <div style={{ position: "relative" }}>
            <input
              type={apiKeyVisible ? "text" : "password"}
              placeholder={mode === "backend" ? "API Key (任意)" : "OpenAI API Key *"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "8px", padding: "5px 32px 5px 10px", fontSize: "12px", width: "200px", outline: "none" }}
            />
            <button onClick={() => setApiKeyVisible((v) => !v)}
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "13px", padding: 0 }}>
              {apiKeyVisible ? "🙈" : "👁️"}
            </button>
          </div>

          {/* 設定ボタン */}
          <button onClick={() => setShowSettings((v) => !v)}
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", color: "white", borderRadius: "8px", padding: "5px 10px", cursor: "pointer", fontSize: "16px" }}
            title="Backend URL 設定">
            ⚙️
          </button>

          {/* ステータスドット */}
          {mode === "backend" && (
            <div
              title={backendStatus === "ok" ? "Backend 接続済み" : "Backend 未接続"}
              style={{ width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0,
                background: backendStatus === "ok" ? "#4ade80" : "#f87171",
                boxShadow: `0 0 6px ${backendStatus === "ok" ? "#4ade80" : "#f87171"}` }}
            />
          )}
        </div>
      </header>

      {/* ══════════════════ Backend URL 設定パネル ══════════════════ */}
      {showSettings && (
        <div style={{ background: "#1e1b4b", padding: "12px 20px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", whiteSpace: "nowrap" }}>Backend URL:</span>
          <input
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "6px", padding: "5px 10px", fontSize: "13px", width: "260px", outline: "none" }}
          />
          <button onClick={checkBackend}
            style={{ background: "#4f46e5", color: "white", border: "none", borderRadius: "6px", padding: "5px 14px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
            接続確認
          </button>
          <span style={{ fontSize: "12px", color: backendStatus === "ok" ? "#4ade80" : "#f87171" }}>
            {backendStatus === "ok" ? "✓ 接続OK" : backendStatus === "error" ? "✗ 接続失敗" : "—"}
          </span>
        </div>
      )}

      {/* ══════════════════════ タブ ══════════════════════ */}
      <div style={{ background: "white", borderBottom: `1px solid ${colors.border}`, display: "flex", padding: "0 20px" }}>
        {[["chat","💬 チャット"], ["profile", `📝 プロフィール${profileFilled ? " ✅" : ""}`]].map(([tab, label]) => (
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

      {/* ══════════════════════ メインコンテンツ ══════════════════════ */}
      <main style={{ flex: 1, maxWidth: "860px", width: "100%", margin: "0 auto", padding: "20px 16px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>

        {/* ════ プロフィール編集タブ ════ */}
        {activeTab === "profile" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>プロフィール情報</h2>
                <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: "13px" }}>
                  {mode === "backend"
                    ? "「保存」でバックエンドに送信し、RAG インデックスを再構築します。"
                    : "入力した情報がブラウザ内の RAG 知識ベースになります。"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={addSection}
                  style={{ background: colors.primary, color: "white", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" }}>
                  ＋ セクション追加
                </button>
                {mode === "backend" && (
                  <button onClick={saveProfileToBackend} disabled={profileSaving}
                    style={{ background: profileSaved ? colors.success : "#059669", color: "white", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: profileSaving ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", opacity: profileSaving ? 0.7 : 1 }}>
                    {profileSaving ? "保存中…" : profileSaved ? "✓ 保存完了" : "💾 保存"}
                  </button>
                )}
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

            {/* ヒントカード */}
            <div style={{ background: colors.successBg, border: "1px solid #bbf7d0", borderRadius: "12px", padding: "14px 18px", display: "flex", gap: "10px" }}>
              <span style={{ fontSize: "18px" }}>💡</span>
              <div style={{ fontSize: "13px", color: "#15803d", lineHeight: 1.6 }}>
                <strong>ヒント：</strong>具体的なエピソードや数字を含めると、AIがより詳しく回答できます。
                {mode === "backend" && <><br />入力後は「💾 保存」を押してから「チャット」タブで試してみましょう！</>}
              </div>
            </div>
          </div>
        )}

        {/* ════ チャットタブ ════ */}
        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>

            {/* チャットサブヘッダー */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", color: colors.muted }}>
                {mode === "backend"
                  ? backendStatus === "ok"
                    ? `🖥 Backend 接続済み | ${sections.filter((s) => s.content.trim()).length} セクション`
                    : "⚠️ Backend 未接続 — 設定で URL を確認してください"
                  : profileFilled
                    ? `⚡ Direct モード | ${sections.filter((s) => s.content.trim()).length} セクション (ブラウザ内 RAG)`
                    : "⚠️ プロフィール未入力"}
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

            {/* RAG コンテキスト表示 */}
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

            {/* メッセージエリア */}
            <div style={{ flex: 1, overflowY: "auto", background: colors.card, borderRadius: "12px", padding: "18px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: `1px solid ${colors.border}`, minHeight: "320px", maxHeight: "calc(100vh - 380px)" }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
                  <div style={{ fontSize: "50px", marginBottom: "12px" }}>🧠</div>
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
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: colors.primaryGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>🧠</div>
                      )}
                      <div style={{
                        maxWidth: "72%", padding: "11px 15px",
                        borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        background: msg.role === "user" ? colors.primaryGrad : msg.error ? colors.errorBg : "#f9fafb",
                        color: msg.role === "user" ? "white" : msg.error ? colors.error : colors.text,
                        fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      }}>
                        {msg.content}
                      </div>
                      {msg.role === "user" && (
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>👤</div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: colors.primaryGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>🧠</div>
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

            {/* 入力フォーム */}
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={
                  mode === "direct" && !apiKey ? "まず API キーをヘッダーに入力してください" :
                  mode === "backend" && backendStatus === "error" ? "バックエンドに接続できません" :
                  "質問を入力して Enter または 送信..."
                }
                disabled={(mode === "direct" && !apiKey) || (mode === "backend" && backendStatus === "error") || loading}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: "12px",
                  border: `1px solid ${colors.border}`, fontSize: "14px", outline: "none",
                  background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              />
              <button type="submit"
                disabled={!input.trim() || loading || (mode === "direct" && !apiKey) || (mode === "backend" && backendStatus === "error")}
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
        select option { background: #1e1b4b; }
      `}</style>
    </div>
  );
}
