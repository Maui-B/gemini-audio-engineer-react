import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import Waveform from "./components/Waveform.jsx";
import { analyzeAudio, fetchSpectrogram, sendChatMessage } from "./api.js";

export default function App() {
  const [file, setFile] = useState(null);
  const [selection, setSelection] = useState({ startSec: 0, endSec: 0, durationSec: 0 });

  const [modelId, setModelId] = useState("gemini-3-pro-preview"); // Default to newer model
  const [temperature, setTemperature] = useState(0.2);
  const [thinkingBudget, setThinkingBudget] = useState(0);

  const [prompt, setPrompt] = useState(
    "Analyze the low-end balance between the kick and bass. Is it muddy around 150–300 Hz? Suggest specific EQ and compression moves."
  );

  const [spectrogramB64, setSpectrogramB64] = useState("");

  // Chat State
  const [sessionId, setSessionId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [replyInput, setReplyInput] = useState("");

  const [error, setError] = useState("");
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingReply, setLoadingReply] = useState(false);

  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const canAct = useMemo(() => {
    return !!file && selection.endSec > selection.startSec;
  }, [file, selection]);

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setChatMessages([]);
    setSessionId(null);
    setError("");
    setSpectrogramB64("");
  };

  const onSelectionChange = useCallback((sel) => {
    setSelection(sel);
  }, []);

  const generateSpectrogram = async () => {
    if (!canAct) return;
    setError("");
    setLoadingSpec(true);
    try {
      const data = await fetchSpectrogram({
        file,
        startSec: selection.startSec,
        endSec: selection.endSec,
      });
      setSpectrogramB64(data.spectrogramPngBase64);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoadingSpec(false);
    }
  };

  const runAnalysis = async () => {
    if (!canAct) return;
    setError("");
    setLoadingAnalyze(true);
    setChatMessages([]); // Reset chat on new analysis
    setSessionId(null);

    try {
      // Optimistic update
      setChatMessages([{ role: "user", text: prompt }]);

      const data = await analyzeAudio({
        file,
        startSec: selection.startSec,
        endSec: selection.endSec,
        prompt,
        modelId,
        temperature,
        thinkingBudget,
      });

      setSessionId(data.sessionId);
      setSpectrogramB64(data.spectrogramPngBase64);
      setChatMessages(prev => [...prev, { role: "model", text: data.advice }]);
    } catch (e) {
      setError(e?.message || String(e));
      setChatMessages(prev => prev.filter(m => m.text !== prompt)); // Remove failed prompt
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const sendReply = async () => {
    if (!sessionId || !replyInput.trim()) return;
    setLoadingReply(true);
    const msg = replyInput;
    setReplyInput("");

    setChatMessages(prev => [...prev, { role: "user", text: msg }]);

    try {
      const data = await sendChatMessage(sessionId, msg);
      setChatMessages(prev => [...prev, { role: "model", text: data.reply }]);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoadingReply(false);
    }
  };

  return (
    <div className="container">
      <div className="card stack">
        <div>
          <h1>🎛️ Mix Assistant (Gemini 2.0 Chat)</h1>
          <p>Upload a track, select a region, then chat with the AI engineer.</p>
        </div>

        <div className="row">
          <div className="card stack">
            <div>
              <label>1) Upload audio</label>
              <input type="file" accept="audio/*" onChange={onPickFile} />
              <div className="muted">Supports WAV/MP3/FLAC. Analysis is session-based.</div>
            </div>

            {file && (
              <>
                <div className="hr" />
                <div>
                  <label>2) Waveform + selection (local)</label>
                  <Waveform file={file} onSelectionChange={onSelectionChange} />
                </div>

                <div className="kpi">
                  <span className="pill">Start: {selection.startSec.toFixed(2)}s</span>
                  <span className="pill">End: {selection.endSec.toFixed(2)}s</span>
                  <span className="pill">Len: {(selection.endSec - selection.startSec).toFixed(2)}s</span>
                </div>
              </>
            )}
          </div>

          <div className="card stack">
            <div>
              <label>Model</label>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                <option value="gemini-3-pro-preview">gemini-3-pro-preview (New Flagship)</option>
                <option value="gemini-3-flash-preview">gemini-3-flash-preview (Fast)</option>
                <option value="gemini-2.0-flash-thinking-exp">gemini-2.0-flash-thinking-exp (Reasoning)</option>
                <option value="gemini-2.0-flash-exp">gemini-2.0-flash-exp (Stable)</option>
              </select>
            </div>

            <div className="row" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label>Temp ({temperature})</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Thinking Level</label>
                <select
                  value={thinkingBudget}
                  onChange={(e) => setThinkingBudget(Number(e.target.value))}
                >
                  <option value={0}>Off (Standard)</option>
                  <option value={1024}>Low (Fast)</option>
                  <option value={4096}>Medium (Balanced)</option>
                  <option value={8192}>High (Deep)</option>
                </select>
              </div>
            </div>

            <div>
              <label>3) Initial Context Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={!!sessionId} // Lock initial prompt once chat starts
                style={{ minHeight: "80px" }}
              />
            </div>

            <div className="kpi">
              <button className="btn secondary" disabled={!canAct || loadingSpec} onClick={generateSpectrogram}>
                {loadingSpec ? "Generating..." : "Preview Spectrogram"}
              </button>
              <button className="btn" disabled={!canAct || loadingAnalyze || !!sessionId} onClick={runAnalysis}>
                {loadingAnalyze ? "Starting Session..." : !!sessionId ? "Session Active" : "Analyze (Start Chat)"}
              </button>
            </div>

            {!!sessionId && (
              <div className="muted" style={{ textAlign: "center", width: "100%" }}>
                Session Active. Use the chat below to continue.
              </div>
            )}

            {error && (
              <div className="card" style={{ borderColor: "#ffb3b3", background: "#fff7f7" }}>
                <strong>Error</strong>
                <div className="muted">{error}</div>
              </div>
            )}
          </div>
        </div>

        {(spectrogramB64 || chatMessages.length > 0) && <div className="hr" />}

        <div className="row">
          <div className="card stack">
            <label>Spectrogram Reference</label>
            {spectrogramB64 ? (
              <img src={`data:image/png;base64,${spectrogramB64}`} alt="Spectrogram" />
            ) : (
              <div className="muted">Will appear here after preview or analysis.</div>
            )}
          </div>

          <div className="card stack" style={{ maxHeight: "600px", display: "flex", flexDirection: "column" }}>
            <label>Chat Session</label>

            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #eee", borderRadius: "8px", padding: "10px", background: "#f9f9f9", display: "flex", flexDirection: "column", gap: "10px" }}>
              {chatMessages.length === 0 && <div className="muted" style={{ textAlign: "center", marginTop: "20px" }}>No messages yet. Start analysis to chat.</div>}

              {chatMessages.map((msg, idx) => (
                <div key={idx} style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  background: msg.role === "user" ? "#111" : "#fff",
                  color: msg.role === "user" ? "#fff" : "#111",
                  border: msg.role === "model" ? "1px solid #ddd" : "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}>
                  <div style={{ fontWeight: 600, fontSize: "11px", marginBottom: "4px", opacity: 0.7 }}>
                    {msg.role === "user" ? "You" : "Gemini"}
                  </div>
                  <pre style={{
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                    margin: 0,
                    fontFamily: "inherit",
                    fontSize: "13px",
                    background: "transparent",
                    color: "inherit",
                    padding: 0,
                    border: "none"
                  }}>
                    {msg.text}
                  </pre>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <input
                type="text"
                placeholder={sessionId ? "Ask a follow-up question..." : "Start analysis first..."}
                value={replyInput}
                onChange={e => setReplyInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendReply()}
                disabled={!sessionId || loadingReply}
                style={{ flex: 1, borderRadius: "8px", border: "1px solid #ddd", padding: "10px" }}
              />
              <button
                className="btn"
                disabled={!sessionId || loadingReply || !replyInput.trim()}
                onClick={sendReply}
              >
                {loadingReply ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
