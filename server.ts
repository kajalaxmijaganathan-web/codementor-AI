import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API endpoint for Student AI Doubt Chatbot
app.post("/api/chat", async (req, res) => {
  try {
    const { message, currentCode, currentError, currentConcept } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const systemPrompt = `You are CodeMentor AI, an intelligent, patient, and friendly Python programming mentor for students.
Your goal is to answer student doubts clearly, simply, and with Socratic encouragement.
Keep your explanations beginner-friendly, concise, and focused on helping them understand core Python fundamentals.
If they share an error, explain what caused it and guide them toward the fix without just dumping raw solutions.

Context about the student's current workspace:
- Current Python Code:
\`\`\`python
${currentCode || "# No code currently in editor"}
\`\`\`
- Recent Error: ${currentError || "None"}
- Target Concept: ${currentConcept || "None"}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: message,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    const reply = response.text || "I couldn't process that question right now. Could you rephrase your doubt?";
    return res.json({ reply });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    // Provide a helpful fallback response if API key is not configured or network error
    return res.status(500).json({
      error: error.message || "Failed to contact Gemini API",
    });
  }
});

// Mount Vite middleware in development
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`CodeMentor AI server running at http://localhost:${port}`);
  });
}

startServer();
