import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { authenticateUser } from "./server/auth";
import authRoutes from "./server/authRoutes";
import shopRoutes from "./server/shopRoutes";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(authenticateUser);

// Mount Custom Authentication and Shop API routes
app.use("/api/auth", authRoutes);
app.use("/api/shop", shopRoutes);

// In-memory / server-authoritative system broadcast state
let currentSystemBroadcast: any = {
  id: 'current',
  title: '',
  message: '',
  type: 'info',
  active: false,
  author: 'BlizFlow System Operations',
  updatedAt: new Date().toISOString(),
  persistent: false,
};

app.get('/api/broadcast', (req, res) => {
  res.json({ success: true, broadcast: currentSystemBroadcast.active ? currentSystemBroadcast : null });
});

app.post('/api/broadcast', (req, res) => {
  const { title, message, type, active, author, persistent } = req.body || {};
  currentSystemBroadcast = {
    id: 'current',
    title: (title || '').trim(),
    message: (message || '').trim(),
    type: type || 'info',
    active: active !== undefined ? !!active : true,
    author: (author || 'BlizFlow System Operations').trim(),
    updatedAt: new Date().toISOString(),
    persistent: !!persistent,
  };
  res.json({ success: true, broadcast: currentSystemBroadcast });
});

app.delete('/api/broadcast', (req, res) => {
  currentSystemBroadcast = {
    id: 'current',
    title: '',
    message: '',
    type: 'info',
    active: false,
    author: 'BlizFlow System Operations',
    updatedAt: new Date().toISOString(),
    persistent: false,
  };
  res.json({ success: true, message: 'Broadcast cleared.' });
});

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

// AI Assistant Endpoint
app.post("/api/gemini", async (req, res) => {
  try {
    const { products, transactions } = req.body;

    // Validate input
    if (!Array.isArray(products) || !Array.isArray(transactions)) {
      res.status(400).json({ error: "Invalid products or transactions format" });
      return;
    }

    const aiClient = getAI();

    // Prepare system instructions and prompt
    const prompt = `
You are a highly concise daily business intelligence assistant for a local shop owner using the BlizFlow app.
Your task is to analyze the current products inventory and today's transactions and generate 3 to 4 short, highly actionable, friendly, plain-language bullet points highlighting business insights.

Follow these strict constraints:
- Do NOT use technical jargon, do NOT use HTML or complex markdown formats. Use simple plain-text bullets starting with "• ".
- Keep it extremely short (no more than 2-3 lines per bullet).
- Never output markdown formatting other than plain bullets (e.g. no bolding "**", no italics, no code blocks).
- Focus only on sales volumes, what's low or out of stock, best selling categories or items, and smart restocking suggestions.
- Example structure:
• You sold 26 loaves of bread today.
• Cold drinks are currently your best-selling products.
• White Bread is running low.
• Consider restocking Eggs since they are out of stock.

Here is the store data:
Current Inventory:
${products.map(p => `- ${p.name} (Category: ${p.category}, Stock: ${p.stockQuantity} ${p.unit}, Price: $${p.sellingPrice}, Low stock threshold: ${p.lowStockLevel || 5})`).join('\n')}

Today's Sales Transactions:
${transactions.map(t => `- Total: $${t.totalAmount}, Items: ${t.items.map((i: any) => `${i.quantity}x ${i.productName} ($${i.price})`).join(', ')}`).join('\n')}
    `;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    res.json({ insights: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI insights. Make sure GEMINI_API_KEY is configured in Settings." });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
