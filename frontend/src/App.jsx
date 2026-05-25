import { useState } from "react";

function App() {

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const askQuestion = async () => {

    const response = await fetch(
      "http://127.0.0.1:8000/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question,
        }),
      }
    );

    const data = await response.json();

    setAnswer(data.answer);
  };

  return (
    <div style={{ padding: 40 }}>

      <h1>RAG Assistant</h1>

      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="質問してください"
        style={{
          width: 300,
          padding: 10,
        }}
      />

      <button onClick={askQuestion}>
        送信
      </button>

      <h2>回答</h2>

      <p>{answer}</p>

    </div>
  );
}

export default App;