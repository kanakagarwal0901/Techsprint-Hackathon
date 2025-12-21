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

// --- AI CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

// --- AUTO-CLEAN CACHE ---
if (fs.existsSync(CACHE_FILE)) {
    try { fs.unlinkSync(CACHE_FILE); } catch(e) {}
}

// --- HELPER FUNCTIONS ---
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
    const cache = loadCache();
    if (cache[emailId]) return cache[emailId];

    const cleanText = emailText.substring(0, 1000).replace(/\s+/g, ' '); 
    const today = new Date().toISOString().split('T')[0];

    const prompt = `
    Extract event details as JSON.
    CONTEXT: Today is ${today}.
    
    RULES:
    1. "date": YYYY-MM-DD. 
       - If email says "tomorrow", calculate from ${today}.
       - If "today", use ${today}.
    2. "time": HH:MM AM/PM.
    3. "venue": Location.
    
    JSON: { "title": "", "date": "", "time": "", "venue": "", "summary": "" }
    Email: "${cleanText}"
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        let jsonData = JSON.parse(text);
        
        cache[emailId] = jsonData;
        saveCache(cache);
        return jsonData;

    } catch (error) {
        console.error(`⚠️ AI Error: ${error.message}`);
        return null;
    }
}

app.get('/api/refresh-events', async (req, res) => {
    console.log("🔄 Fetching emails from the last 48 hours...");
    try {
        const gmail = getGmailClient();
        
        // --- THE FIX: "newer_than:2d" ---
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 20, 
            q: 'subject:(event OR session OR hackathon OR contest OR competition OR club OR webinar OR workshop OR internship) newer_than:2d' 
        });

        const messages = response.data.messages || [];
        
        // If no emails found in the last 2 days, STOP.
        if (messages.length === 0) {
            console.log("📭 No relevant emails found in the last 2 days.");
            return res.json({ success: true, events: [] });
        }

        const processedEvents = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const msg of messages) {
            let eventData;
            const cache = loadCache();

            // Fetch Email Content
            const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const subjectHeader = email.data.payload.headers.find(h => h.name === 'Subject');
            const subject = subjectHeader ? subjectHeader.value : "No Subject";

            console.log(`📧 Found: "${subject}"`);

            if (cache[msg.id]) {
                eventData = cache[msg.id];
            } else {
                eventData = await parseWithGemini(email.data.snippet, msg.id);
                console.log("   ⏳ Waiting 2s...");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (!eventData || !eventData.date) continue;

            const eventDate = new Date(eventData.date);
            if (isNaN(eventDate.getTime())) continue;

            if (eventDate < today) {
                console.log(`   ❌ Skipped (Past Event: ${eventData.date})`);
                continue; 
            }

            console.log(`   ✅ KEPT: ${eventData.title}`);
            processedEvents.push({ id: msg.id, ...eventData });
        }

        console.log(`🚀 Sending ${processedEvents.length} valid events.`);
        res.json({ success: true, events: processedEvents });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));