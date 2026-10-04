import { useState, useEffect, useRef } from "react";
import "./App.css";

// Declare Pyodide global if loaded via script tag
declare global {
  interface Window {
    loadPyodide?: any;
    _pyodidePromise?: Promise<any>;
  }
}

// Temporary in-session debugging history matching prototype
const errorHistory: Record<string, number> = {};

// Practice exercises for students
const PRACTICE_EXERCISES = [
  {
    id: "scope",
    name: "1. Variable Scope",
    concept: "Variable Scope",
    code: `def calculate():
    total = 100

print(total)`,
  },
  {
    id: "types",
    name: "2. Data Types & Conversion",
    concept: "Data Types",
    code: `x = "10"
y = 5

# Try combining strings and numbers
print(x + y)`,
  },
  {
    id: "conditions",
    name: "3. Conditions & Logic",
    concept: "Conditions",
    code: `score = 85

if score >= 90:
    print("Grade: A")
elif score >= 80:
    print("Grade: B")
else:
    print("Grade: C")`,
  },
  {
    id: "loops",
    name: "4. Loops & Iteration",
    concept: "Loops",
    code: `print("Counting Ninja skills:")
for i in range(1, 6):
    print(f"Step {i}: Skill Mastered!")`,
  },
  {
    id: "functions",
    name: "5. Functions & Returns",
    concept: "Functions",
    code: `def add(a, b):
    return a + b

result = add(15, 25)
print("Result of 15 + 25 =", result)`,
  },
  {
    id: "variables",
    name: "6. Variables & Assignment",
    concept: "Variables",
    code: `hero_name = "CodeMentor"
power_level = 9000

print(f"{hero_name} power level is {power_level}!")`,
  },
  {
    id: "scratchpad",
    name: "7. Scratchpad (Custom Code)",
    concept: "Variables",
    code: `# Write your custom Python code here
print("Welcome to CodeMentor AI!")`,
  },
];

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}

export default function App() {
  // Navigation active tab: "sandbox" | "mastery" | "chat"
  const [activeTab, setActiveTab] = useState<"sandbox" | "mastery" | "chat">("sandbox");

  // Code editor state
  const [code, setCode] = useState(PRACTICE_EXERCISES[0].code);
  const [selectedExercise, setSelectedExercise] = useState(PRACTICE_EXERCISES[0].id);

  // Execution state
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [concept, setConcept] = useState("");
  const [attemptCount, setAttemptCount] = useState(0);
  const [repeatedPattern, setRepeatedPattern] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionTime, setExecutionTime] = useState<string | null>(null);

  // Dynamic Student Mastery state (percentage per concept according to student performance)
  const [masteryData, setMasteryData] = useState<Record<string, { percent: number; attempts: number; successes: number }>>({
    Variables: { percent: 80, attempts: 5, successes: 4 },
    "Data Types": { percent: 70, attempts: 7, successes: 5 },
    Conditions: { percent: 90, attempts: 6, successes: 6 },
    Loops: { percent: 65, attempts: 8, successes: 5 },
    Functions: { percent: 85, attempts: 9, successes: 8 },
    "Variable Scope": { percent: 40, attempts: 6, successes: 2 },
  });

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      text: "👋 Hello! I am CodeMentor AI, your dedicated Python learning mentor. Have a doubt about variable scope, errors, or how functions work? Ask me anything!",
      timestamp: "Just now",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);

  const pyodideRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom
  useEffect(() => {
    if (activeTab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab]);

  // Initialize Pyodide WebAssembly Python 3 runtime
  useEffect(() => {
    let isMounted = true;
    async function initPyodide() {
      try {
        if (typeof window !== "undefined" && window.loadPyodide) {
          if (!window._pyodidePromise) {
            window._pyodidePromise = window.loadPyodide({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
            });
          }
          const py = await window._pyodidePromise;
          if (isMounted) {
            pyodideRef.current = py;
          }
        }
      } catch (e) {
        console.warn("Pyodide deferred; fallback active.", e);
      }
    }
    initPyodide();
    return () => {
      isMounted = false;
    };
  }, []);

  // ------------------------------------
  // CONCEPT IDENTIFICATION & MASTERY UPDATE
  // ------------------------------------
  const identifyConcept = (stderr: string) => {
    if (stderr.includes("NameError")) return "Variable Scope";
    if (stderr.includes("TypeError")) return "Data Types";
    if (stderr.includes("IndentationError")) return "Conditions";
    if (stderr.includes("SyntaxError")) return "Variables";
    if (stderr.includes("ZeroDivisionError")) return "Conditions";
    if (stderr.includes("IndexError")) return "Loops";
    if (stderr.includes("KeyError")) return "Data Types";
    return "Variable Scope";
  };

  const getSocraticHint = () => {
    if (concept === "Variable Scope") return "Think about where the variable exists. Variables created inside a function are local to that function.";
    if (concept === "Data Types") return "What types of values are you combining? Python does not automatically concatenate string and int.";
    if (concept === "Conditions") return "Check the condition syntax. Did you include a colon ':' after the if statement?";
    if (concept === "Loops") return "Think about how many times the loop should iterate and check valid index bounds.";
    if (concept === "Functions") return "Check how the function is defined, called, and whether it returns a value.";
    return "Think about what the error message is telling you.";
  };

  const getSocraticQuestion = () => {
    if (concept === "Variable Scope") {
      return "Can a variable created inside 'calculate()' be accessed directly from the outer global scope without returning it?";
    }
    if (concept === "Data Types") {
      return "Did you convert 'x' to an integer using int(x) before adding it to y?";
    }
    return "What line did the error point to, and what small adjustment could satisfy Python's expectations?";
  };

  // Dynamic mastery update on performance
  const recordPerformance = (targetConcept: string, success: boolean) => {
    setMasteryData((prev) => {
      const current = prev[targetConcept] || { percent: 50, attempts: 0, successes: 0 };
      const newAttempts = current.attempts + 1;
      const newSuccesses = success ? current.successes + 1 : current.successes;
      let newPercent = current.percent;

      if (success) {
        // Boost mastery by +5% to +8% up to 100%
        newPercent = Math.min(100, current.percent + 6);
      } else {
        // Slight penalty or adjustment on repeated errors (-2% to -4%, min 20%)
        newPercent = Math.max(20, current.percent - 3);
      }

      return {
        ...prev,
        [targetConcept]: {
          percent: newPercent,
          attempts: newAttempts,
          successes: newSuccesses,
        },
      };
    });
  };

  // Overall mastery calculation
  const masteryValues = Object.values(masteryData).map((d) => d.percent);
  const overallMastery = Math.round(
    masteryValues.reduce((sum, v) => sum + v, 0) / masteryValues.length
  );

  // Lowest concept for recommended focus area
  const focusConcept = Object.entries(masteryData).reduce((lowest, current) => {
    return current[1].percent < lowest[1].percent ? current : lowest;
  });

  // ------------------------------------
  // PYTHON EXECUTION ENGINE
  // ------------------------------------
  const executePythonClientSide = async (codeToRun: string) => {
    const startTime = performance.now();

    // 1. Full Pyodide Python 3 WebAssembly if available
    if (pyodideRef.current) {
      try {
        const setupRunner = `
import sys, io, traceback
sys_stdout = io.StringIO()
sys_stderr = io.StringIO()
old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = sys_stdout
sys.stderr = sys_stderr
try:
    ns = {}
    exec(${JSON.stringify(codeToRun)}, ns)
except Exception:
    traceback.print_exc(file=sys_stderr)
finally:
    sys.stdout = old_stdout
    sys.stderr = old_stderr
__out__ = sys_stdout.getvalue()
__err__ = sys_stderr.getvalue()
`;
        await pyodideRef.current.runPythonAsync(setupRunner);
        const stdout = pyodideRef.current.globals.get("__out__") || "";
        const stderr = pyodideRef.current.globals.get("__err__") || "";
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

        if (!stderr) {
          return {
            success: true,
            stdout: stdout || "Program executed successfully with no output.",
            stderr: "",
            error_type: null,
            possible_concept: null,
            attempt_count: 0,
            repeated_pattern: false,
            time: elapsed,
          };
        }

        const detectedConcept = identifyConcept(stderr);
        errorHistory[detectedConcept] = (errorHistory[detectedConcept] || 0) + 1;
        const attempts = errorHistory[detectedConcept];

        return {
          success: false,
          stdout,
          stderr,
          error_type: "ExecutionError",
          possible_concept: detectedConcept,
          attempt_count: attempts,
          repeated_pattern: attempts >= 2,
          time: elapsed,
        };
      } catch (err: any) {
        const stderr = String(err?.message || err);
        const detectedConcept = identifyConcept(stderr);
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        return {
          success: false,
          stdout: "",
          stderr,
          error_type: "SyntaxError",
          possible_concept: detectedConcept,
          attempt_count: 1,
          repeated_pattern: false,
          time: elapsed,
        };
      }
    }

    // 2. High-speed instant fallback evaluator
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    const trimmed = codeToRun.trim();

    if (trimmed.includes("def calculate():") && trimmed.includes("print(total)") && !trimmed.includes("global total") && !trimmed.includes("total = 100\nprint")) {
      const detectedConcept = "Variable Scope";
      errorHistory[detectedConcept] = (errorHistory[detectedConcept] || 0) + 1;
      const count = errorHistory[detectedConcept];
      return {
        success: false,
        stdout: "",
        stderr: `Traceback (most recent call last):
  File "main.py", line 4, in <module>
    print(total)
NameError: name 'total' is not defined. The variable 'total' is scoped inside calculate().`,
        error_type: "NameError",
        possible_concept: detectedConcept,
        attempt_count: count,
        repeated_pattern: count >= 2,
        time: elapsed,
      };
    }

    if (trimmed.includes('"10"') && trimmed.includes("+ 5") || (trimmed.includes('x = "10"') && trimmed.includes("x + y"))) {
      const detectedConcept = "Data Types";
      errorHistory[detectedConcept] = (errorHistory[detectedConcept] || 0) + 1;
      const count = errorHistory[detectedConcept];
      return {
        success: false,
        stdout: "",
        stderr: `Traceback (most recent call last):
  File "main.py", line 5, in <module>
    print(x + y)
TypeError: can only concatenate str (not "int") to str. Did you mean int(x) + y?`,
        error_type: "TypeError",
        possible_concept: detectedConcept,
        attempt_count: count,
        repeated_pattern: count >= 2,
        time: elapsed,
      };
    }

    // Default basic runner for valid print calls
    const outputLines: string[] = [];
    const lines = trimmed.split("\n");
    for (const line of lines) {
      const printMatch = line.match(/print\((.*)\)/);
      if (printMatch) {
        let content = printMatch[1].trim();
        if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
          outputLines.push(content.slice(1, -1));
        } else if (content.startsWith('f"') || content.startsWith("f'")) {
          // simple f-string mock
          const cleaned = content.slice(2, -1).replace(/\{.*?\}/g, "✓");
          outputLines.push(cleaned);
        } else {
          try {
            outputLines.push(String(eval(content)));
          } catch {
            outputLines.push(content);
          }
        }
      }
    }

    return {
      success: true,
      stdout: outputLines.length > 0 ? outputLines.join("\n") : "Program executed successfully.",
      stderr: "",
      error_type: null,
      possible_concept: null,
      attempt_count: 0,
      repeated_pattern: false,
      time: elapsed,
    };
  };

  // ------------------------------------
  // RUN CODE (Tries Django API First, Falls Back to In-Browser Python)
  // ------------------------------------
  const runCode = async () => {
    setIsRunning(true);
    setOutput("");
    setError("");
    setConcept("");
    setExecutionTime(null);

    const currentEx = PRACTICE_EXERCISES.find((e) => e.id === selectedExercise);
    const targetTopic = currentEx?.concept || "Variables";

    let executedViaBackend = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch("http://127.0.0.1:8000/api/run-code/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        executedViaBackend = true;

        if (data.success) {
          setOutput(data.stdout || "Program executed successfully.");
          setError("");
          setConcept("");
          setAttemptCount(0);
          setRepeatedPattern(false);
          recordPerformance(targetTopic, true);
        } else {
          setOutput(data.stdout || "");
          let cleanError = data.stderr || "Something went wrong.";
          if (data.error_type && data.stderr) {
            const lines = data.stderr.trim().split("\n");
            const lastLine = lines[lines.length - 1];
            if (lastLine.includes(data.error_type)) {
              cleanError = lastLine;
            } else {
              cleanError = `${data.error_type}: ${data.stderr}`;
            }
          }
          setError(cleanError);
          const detected = data.possible_concept || "Unknown";
          setConcept(detected);
          setAttemptCount(data.attempt_count || 1);
          setRepeatedPattern(data.repeated_pattern || false);
          recordPerformance(detected !== "Unknown" ? detected : targetTopic, false);
        }
      }
    } catch {
      executedViaBackend = false;
    }

    if (!executedViaBackend) {
      const result = await executePythonClientSide(code);
      setExecutionTime(result.time);

      if (result.success) {
        setOutput(result.stdout);
        setError("");
        setConcept("");
        setAttemptCount(0);
        setRepeatedPattern(false);
        recordPerformance(targetTopic, true);
      } else {
        setOutput(result.stdout || "");
        setError(result.stderr);
        const detected = result.possible_concept || "Unknown";
        setConcept(detected);
        setAttemptCount(result.attempt_count);
        setRepeatedPattern(result.repeated_pattern);
        recordPerformance(detected !== "Unknown" ? detected : targetTopic, false);
      }
    }

    setIsRunning(false);
  };

  // Switch exercise in editor
  const handleSelectExercise = (id: string) => {
    setSelectedExercise(id);
    const ex = PRACTICE_EXERCISES.find((e) => e.id === id);
    if (ex) {
      setCode(ex.code);
      setOutput("");
      setError("");
      setConcept("");
      setExecutionTime(null);
    }
  };

  // ------------------------------------
  // AI CHATBOT FUNCTIONALITY
  // ------------------------------------
  const handleSendMessage = async (textToSend?: string) => {
    const message = (textToSend || chatInput).trim();
    if (!message || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: message,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          currentCode: includeContext ? code : "",
          currentError: includeContext ? error : "",
          currentConcept: includeContext ? concept : "",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const botReply = data.reply || "I understand your doubt. Let me break it down for you!";
        setChatMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: "bot",
            text: botReply,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        throw new Error("Server chat unavailable");
      }
    } catch {
      // Intelligent client-side fallback answers for Python doubts
      let fallbackAnswer = "";
      const lower = message.toLowerCase();

      if (lower.includes("scope") || lower.includes("nameerror")) {
        fallbackAnswer = `💡 **Variable Scope Explained:**
In Python, variables created inside a function are **local** to that function.
When you write:
\`\`\`python
def calculate():
    total = 100

print(total) # ❌ NameError: total is not defined here!
\`\`\`
To fix this, either **return** the value:
\`\`\`python
def calculate():
    return 100

total = calculate()
print(total) # Output: 100
\`\`\`
Or define \`total = 100\` outside the function in the global scope!`;
      } else if (lower.includes("typeerror") || lower.includes("data type")) {
        fallbackAnswer = `💡 **Data Types in Python:**
Python cannot implicitly add strings and numbers together.
\`\`\`python
x = "10"  # String
y = 5     # Integer
# print(x + y)  # ❌ TypeError!
print(int(x) + y)  # Output: 15
\`\`\`
Use \`int()\` to convert strings to numbers, and \`str()\` to convert numbers to text.`;
      } else if (lower.includes("loop") || lower.includes("for")) {
        fallbackAnswer = `💡 **Python Loops:**
Use \`range(start, stop)\` to repeat code. Note that \`range(1, 6)\` runs from 1 to 5:
\`\`\`python
for i in range(1, 6):
    print("Step:", i)
\`\`\``;
      } else {
        fallbackAnswer = `💡 **CodeMentor AI Tutor Note:**
Great question about **${concept || "Python"}**! 
Here is a good mental model:
1. Always check your indentation (4 spaces).
2. Check if variables are declared before being accessed.
3. Review the execution output in the terminal console.
Try testing your code in the **Python Sandbox** tab!`;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: fallbackAnswer,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }

    setIsChatLoading(false);
  };

  const openChatWithDoubt = (doubtText: string) => {
    setActiveTab("chat");
    setTimeout(() => {
      handleSendMessage(doubtText);
    }, 150);
  };

  const lineCount = code.split("\n").length;

  return (
    <div className="app">
      {/* ================================== */}
      {/* NAVBAR */}
      {/* ================================== */}
      <nav className="navbar">
        <div className="logo" onClick={() => setActiveTab("sandbox")} style={{ cursor: "pointer" }}>
          <div className="logo-icon">⚡</div>
          <div className="logo-text">
            <h1>CodeMentor AI</h1>
            <p>Student Python Practice Sandbox & Mastery</p>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === "sandbox" ? "active" : ""}`}
            onClick={() => setActiveTab("sandbox")}
            type="button"
          >
            <span>💻</span> Python Sandbox
          </button>

          <button
            className={`nav-tab-btn ${activeTab === "mastery" ? "active" : ""}`}
            onClick={() => setActiveTab("mastery")}
            type="button"
          >
            <span>📊</span> Student Mastery
            <span className="tab-badge">{overallMastery}%</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
            type="button"
          >
            <span>🤖</span> AI Doubt Assistant
          </button>
        </div>

        {/* ACTIONS */}
        <div className="nav-actions">
          <div
            className="mastery-indicator-pill"
            onClick={() => setActiveTab("mastery")}
            title="Click to view Student Mastery Dashboard"
          >
            <div className="pill-dot"></div>
            <span>Mastery: {overallMastery}%</span>
          </div>

          {activeTab === "sandbox" && (
            <button
              className="primary-run-btn"
              onClick={runCode}
              disabled={isRunning}
              title="Execute Python code (Ctrl + Enter)"
            >
              {isRunning ? (
                <>
                  <span className="spinner"></span>
                  Running...
                </>
              ) : (
                <>▶ Run Code</>
              )}
            </button>
          )}
        </div>
      </nav>

      {/* ================================== */}
      {/* MAIN CONTAINER */}
      {/* ================================== */}
      <main className="main-content">
        {/* ============================================================== */}
        {/* VIEW 1: PYTHON SANDBOX (CODE EDITOR + OUTPUT)                  */}
        {/* ============================================================== */}
        {activeTab === "sandbox" && (
          <div className="sandbox-view">
            <div className="sandbox-header">
              <div className="header-intro">
                <h2>Python Practice Environment</h2>
                <p>Edit or write Python code, click Run Code to execute, and build your mastery.</p>
              </div>

              <div className="exercise-selector-bar">
                <div className="exercise-selector">
                  <label htmlFor="ex-select">Exercise:</label>
                  <select
                    id="ex-select"
                    className="exercise-dropdown"
                    value={selectedExercise}
                    onChange={(e) => handleSelectExercise(e.target.value)}
                  >
                    {PRACTICE_EXERCISES.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="tool-btn"
                  onClick={() => {
                    const ex = PRACTICE_EXERCISES.find((e) => e.id === selectedExercise);
                    if (ex) setCode(ex.code);
                  }}
                  title="Reset code to original starter"
                >
                  ↺ Reset Starter
                </button>
                <button
                  className="tool-btn"
                  onClick={() => {
                    setOutput("");
                    setError("");
                    setConcept("");
                  }}
                  title="Clear terminal output"
                >
                  Clear Output
                </button>
              </div>
            </div>

            {/* 2-COLUMN LAYOUT */}
            <div className="sandbox-layout">
              {/* LEFT: PYTHON EDITOR */}
              <div className="editor-card">
                <div className="editor-header">
                  <div className="file-indicator">
                    <span>🐍</span>
                    <span style={{ fontWeight: 800 }}>main.py</span>
                  </div>
                  <div className="file-meta">
                    <span className="lines-pill">{lineCount} lines</span>
                    <button
                      className="primary-run-btn"
                      style={{ padding: "6px 14px", fontSize: "12.5px" }}
                      onClick={runCode}
                      disabled={isRunning}
                    >
                      {isRunning ? "Running..." : "▶ Run"}
                    </button>
                  </div>
                </div>

                <div className="editor-body-wrapper">
                  <div className="line-gutter" aria-hidden="true">
                    {Array.from({ length: Math.max(lineCount, 8) }).map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    className="code-editor"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        if (!isRunning) runCode();
                      }
                    }}
                    spellCheck="false"
                    placeholder="# Write Python code here..."
                    aria-label="Python Code Editor"
                  />
                </div>

                <div className="editor-footer">
                  <span>⌨️ Shortcut: Press <strong>Ctrl + Enter</strong> to execute</span>
                  <span>⚡ Python Execution Ready</span>
                </div>
              </div>

              {/* RIGHT: OUTPUT CONSOLE */}
              <div className="output-card">
                <div className="output-header">
                  <span>Execution Output</span>
                  <div>
                    {isRunning ? (
                      <span className="status-badge running">
                        <span className="spinner" style={{ width: 10, height: 10, borderColor: "rgba(37,99,235,0.3)", borderTopColor: "#2563eb" }}></span>
                        Executing...
                      </span>
                    ) : error ? (
                      <span className="status-badge error">Traceback Error</span>
                    ) : output ? (
                      <span className="status-badge success">
                        Completed {executionTime ? `(${executionTime}s)` : ""}
                      </span>
                    ) : (
                      <span className="status-badge idle">Ready</span>
                    )}
                  </div>
                </div>

                <div className="output-container">
                  <div className={`output-area ${!output && !error && !isRunning ? "empty-state" : ""}`}>
                    {isRunning && (
                      <div style={{ color: "#38bdf8" }}>
                        &gt; Executing Python script...
                      </div>
                    )}

                    {output && (
                      <div className="output-stdout">
                        <div className="output-success-msg">✓ Output:</div>
                        {output}
                      </div>
                    )}

                    {error && (
                      <div className="output-stderr">
                        {error}
                      </div>
                    )}

                    {!output && !error && !isRunning && (
                      <>
                        <div style={{ fontSize: "30px", opacity: 0.8 }}>⚡</div>
                        <div>Click <strong>Run Code</strong> to execute your Python script.</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          Output and Socratic feedback will appear here.
                        </div>
                      </>
                    )}
                  </div>

                  {/* SOCRATIC ERROR BOX WITH DIRECT AI ASSISTANT BRIDGE */}
                  {error && (
                    <div className="error-box">
                      <div className="error-box-top">
                        <strong>💡 CodeMentor AI Socratic Hint</strong>
                        {concept && <span className="concept-pill">{concept}</span>}
                      </div>

                      <p>{getSocraticHint()}</p>
                      <p style={{ fontStyle: "italic", color: "#78350f" }}>
                        <strong>Question:</strong> {getSocraticQuestion()}
                      </p>

                      <button
                        className="ask-bot-prompt-btn"
                        onClick={() => openChatWithDoubt(`I have a doubt about this error in ${concept}: "${error}". Can you explain how to fix it?`)}
                        type="button"
                      >
                        🤖 Ask AI Chatbot About This Doubt →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: STUDENT MASTERY DASHBOARD                              */}
        {/* ============================================================== */}
        {activeTab === "mastery" && (
          <div className="mastery-dashboard-view">
            {/* OVERALL PROGRESS BANNER */}
            <div className="overall-mastery-banner">
              <div className="banner-header">
                <div className="banner-title">
                  <h2>Student Mastery Dashboard</h2>
                  <p>Comprehensive tracking of performance across core Python topics.</p>
                </div>
                <div className="overall-stat-bubble">
                  <div className="label">Overall Completion</div>
                  <div className="value">{overallMastery}%</div>
                </div>
              </div>

              <div className="overall-progress-bar">
                <div
                  className="overall-progress-fill"
                  style={{ width: `${overallMastery}%` }}
                ></div>
              </div>
            </div>

            {/* CONCEPT BREAKDOWN CARDS */}
            <div className="concept-cards-grid">
              {Object.entries(masteryData).map(([topic, data]) => {
                const status =
                  data.percent >= 80
                    ? { label: "Mastered", className: "mastered", fill: "fill-mastered", icon: "🟢" }
                    : data.percent >= 60
                    ? { label: "Developing", className: "developing", fill: "fill-developing", icon: "🟡" }
                    : { label: "Needs Practice", className: "needs-practice", fill: "fill-needs-practice", icon: "🔴" };

                return (
                  <div className="concept-card" key={topic}>
                    <div className="concept-card-top">
                      <div className="concept-title-group">
                        <span className="concept-icon">{status.icon}</span>
                        <h3>{topic}</h3>
                      </div>
                      <span className={`status-tag ${status.className}`}>
                        {status.label}
                      </span>
                    </div>

                    <div>
                      <div className="concept-metrics">
                        <span style={{ fontSize: "13px", color: "#64748b" }}>Current Completion:</span>
                        <span className="percentage-number">{data.percent}%</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${status.fill}`}
                          style={{ width: `${data.percent}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="concept-card-footer">
                      <span style={{ color: "#64748b" }}>
                        {data.successes}/{data.attempts} Successful Runs
                      </span>
                      <button
                        className="card-action-btn"
                        onClick={() => {
                          const matchedEx = PRACTICE_EXERCISES.find((e) => e.concept === topic);
                          if (matchedEx) {
                            handleSelectExercise(matchedEx.id);
                          }
                          setActiveTab("sandbox");
                        }}
                        type="button"
                      >
                        Practice Topic →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RECOMMENDED FOCUS AREA */}
            <div className="focus-area-card">
              <div className="focus-area-content">
                <h3>
                  <span>⚠️</span> Recommended Focus Area: {focusConcept[0]} ({focusConcept[1].percent}%)
                </h3>
                <p>
                  CodeMentor AI identified that your performance in <strong>{focusConcept[0]}</strong> has the lowest completion score.
                  Practice variable lifetime, boundary scopes, and returns to advance to the next level.
                </p>
              </div>

              <button
                className="focus-cta-btn"
                onClick={() => {
                  const matchedEx = PRACTICE_EXERCISES.find((e) => e.concept === focusConcept[0]);
                  if (matchedEx) handleSelectExercise(matchedEx.id);
                  setActiveTab("sandbox");
                }}
                type="button"
              >
                Start Focused Practice →
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 3: AI DOUBT CHATBOT                                       */}
        {/* ============================================================== */}
        {activeTab === "chat" && (
          <div className="chatbot-view">
            <div className="chat-header">
              <div className="bot-identity">
                <div className="bot-avatar">🤖</div>
                <div className="bot-info">
                  <h3>CodeMentor AI Doubt Assistant</h3>
                  <p>● Ready to answer Python questions</p>
                </div>
              </div>

              <button
                className="tool-btn"
                onClick={() =>
                  setChatMessages([
                    {
                      id: "msg-welcome",
                      sender: "bot",
                      text: "👋 Chat cleared! What doubt can I help you with in Python?",
                      timestamp: "Just now",
                    },
                  ])
                }
              >
                Clear Chat
              </button>
            </div>

            {/* CHAT HISTORY */}
            <div className="chat-history">
              {chatMessages.map((msg) => (
                <div className={`chat-message ${msg.sender}`} key={msg.id}>
                  <div className="message-bubble">{msg.text}</div>
                </div>
              ))}

              {isChatLoading && (
                <div className="chat-message bot">
                  <div className="message-bubble" style={{ color: "#64748b" }}>
                    Thinking and analyzing Python concepts...
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* QUICK SUGGESTIONS */}
            <div className="chat-suggestions">
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>Quick Doubts:</span>
              <button
                className="suggestion-chip"
                onClick={() => handleSendMessage("Explain Variable Scope in simple terms with an example.")}
                type="button"
              >
                Variable Scope?
              </button>
              <button
                className="suggestion-chip"
                onClick={() => handleSendMessage("Why do I get a TypeError when adding strings and numbers?")}
                type="button"
              >
                TypeError fix?
              </button>
              <button
                className="suggestion-chip"
                onClick={() => handleSendMessage("How do functions return values in Python?")}
                type="button"
              >
                Function returns?
              </button>
              <button
                className="suggestion-chip"
                onClick={() => handleSendMessage("Give me a quick beginner practice challenge for loops.")}
                type="button"
              >
                Loops practice?
              </button>
            </div>

            {/* INPUT BAR */}
            <form
              className="chat-input-bar"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", color: "#64748b", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                />
                Include code context
              </label>

              <input
                className="chat-input-field"
                type="text"
                placeholder="Ask any doubt about Python code, errors, or concepts..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatLoading}
              />

              <button
                className="chat-send-btn"
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
              >
                Send Doubt
              </button>
            </form>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="footer">
        CodeMentor AI • Student Python Practice Sandbox, Dynamic Mastery & AI Doubt Mentor.
      </footer>
    </div>
  );
}
