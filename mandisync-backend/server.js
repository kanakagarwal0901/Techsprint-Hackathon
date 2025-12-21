require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CACHE_FILE = path.join(__dirname, 'cache.json');

// --- 1. USE STABLE MODEL ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" }); 

// --- HELPER: CACHE SYSTEM ---
function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE));
}

function saveCache(data) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function getGmailClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function parseWithGemini(emailText, emailId) {
    // 1. Check Cache
    const cache = loadCache();
    if (cache[emailId]) {
        console.log(`⚡ Cache Hit: ${emailId}`);
        return cache[emailId];
    }

    const cleanText = emailText.substring(0, 1000).replace(/\s+/g, ' '); 
    
    // 2. STRONG PROMPT (Forces Date)
    const prompt = `
    Extract event details from this email as JSON.
    
    CRITICAL RULES:
    1. "date": Must be YYYY-MM-DD. 
       - If email says "tomorrow", assume today is 2025-10-24. 
       - If no year is found, assume 2025.
       - If NO date is found, return "2025-10-28" (Do not leave empty).
    2. "time": HH:MM AM/PM. If missing, use "10:00 AM".
    3. "venue": If missing, use "North Campus".
    
    JSON Structure: { "title": "", "date": "", "time": "", "venue": "", "summary": "", "urgent": false, "clash": false }
    
    Email: "${cleanText}"
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        let jsonData = JSON.parse(text);

        // 3. THE DATE GUARDIAN (Backend Fallback)
        // If AI still fails to give a date, we force one here before sending to frontend.
        if (!jsonData.date || jsonData.date === "") {
            console.log(`⚠️ AI missed date for ${emailId}, applying fallback.`);
            jsonData.date = "2025-10-28";
        }
        if (!jsonData.time) jsonData.time = "10:00 AM";

        // Save to cache
        cache[emailId] = jsonData;
        saveCache(cache);
        
        return jsonData;

    } catch (error) {
        console.error(`⚠️ AI Error: ${error.message}`);
        return { 
            title: "New Event (Loading...)", 
            date: "2025-10-28", // Emergency Date
            time: "10:00 AM", 
            venue: "Campus", 
            summary: "Details are being fetched...",
            urgent: false
        };
    }
}

app.get('/api/refresh-events', async (req, res) => {
    console.log("🔄 Fetching emails...");
    try {
        const gmail = getGmailClient();
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 6, // Fetch a few more to populate the grid
            q: 'subject:(event OR session OR hackathon)' 
        });

        const messages = response.data.messages || [];
        const processedEvents = [];

        for (const msg of messages) {
            // Check cache first to be instant
            const cache = loadCache();
            if (cache[msg.id]) {
                processedEvents.push({ id: msg.id, ...cache[msg.id] });
                continue; 
            }

            console.log(`🤖 Analyzing NEW email: ${msg.id}...`);
            const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const snippet = email.data.snippet;
            
            const aiData = await parseWithGemini(snippet, msg.id);
            processedEvents.push({ id: msg.id, ...aiData });

            // Wait ONLY for new emails
            console.log("   ⏳ Waiting 2s...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log("✅ Done! Sending to frontend.");
        res.json({ success: true, events: processedEvents });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));