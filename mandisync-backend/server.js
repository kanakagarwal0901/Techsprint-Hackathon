require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- HELPERS ---
function getGmailClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function parseWithGemini(emailText) {
    const prompt = `
    You are an assistant for a student at IIT Mandi. Extract event details from the following email text.
    
    Rules:
    1. Return ONLY valid JSON. No Markdown formatting.
    2. Format Date as "YYYY-MM-DD". If not found, use today's date.
    3. Format Time as "HH:MM AM/PM".
    4. Detect if the event is "Urgent" (deadline within 24h) or implies free food/swag.
    5. Venue: If "North" or "South" campus is mentioned, include it.
    
    Email Text: "${emailText.substring(0, 1000)}" 
    
    JSON Structure:
    {
        "title": "Short Event Name",
        "date": "YYYY-MM-DD",
        "time": "10:00 AM",
        "venue": "Venue Name",
        "summary": "2 sentence summary",
        "urgent": boolean,
        "clash": false
    }
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        // Cleanup JSON markdown if Gemini adds it
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (error) {
        console.error("AI Parsing Error:", error);
        return { title: "Error Parsing", summary: "Could not extract details." };
    }
}

// --- API ROUTE ---
app.get('/api/refresh-events', async (req, res) => {
    console.log("🔄 Fetching emails...");
    try {
        const gmail = getGmailClient();
        
        // 1. Get Emails (Simulating a search for 'Gymkhana' or 'Event')
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 3, // Keep it low for Hackathon speed
            q: 'subject:(event OR session OR hackathon)' 
        });

        const messages = response.data.messages || [];
        const processedEvents = [];

        // 2. Process each email
        for (const msg of messages) {
            const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const snippet = email.data.snippet;
            
            // Call Gemini to extract data
            console.log(`🤖 Analyzing email: ${msg.id}...`);
            const aiData = await parseWithGemini(snippet);
            
            processedEvents.push({
                id: msg.id,
                ...aiData
            });
        }

        console.log("✅ Done! Sending to frontend.");
        res.json({ success: true, events: processedEvents });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));