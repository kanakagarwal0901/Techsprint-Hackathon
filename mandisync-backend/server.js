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

// Fixed Model Name (was gemini-.5-flash which is invalid)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }); 

// --- AUTO-CLEAN CACHE ---
if (fs.existsSync(CACHE_FILE)) {
    try { fs.unlinkSync(CACHE_FILE); } catch(e) {}
}

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

// --- NEW HELPER: EXTRACT FULL BODY ---
// Gmail sends data in base64url format, sometimes nested in parts.
function getEmailBody(payload) {
    let body = '';
    
    // 1. If simple email, data is directly in body
    if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } 
    // 2. If multipart (e.g. text + html), search for text/plain
    else if (payload.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        } else {
            // Fallback to HTML part if text missing, strip tags later if needed
            const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
            if (htmlPart && htmlPart.body && htmlPart.body.data) {
                body = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
            }
        }
    }
    return body;
}

async function parseWithGemini(emailText, emailId) {
    const cache = loadCache();
    if (cache[emailId]) return cache[emailId];

    // Increased limit to 2500 to catch links at the bottom/footer
    const cleanText = emailText.substring(0, 2500).replace(/\s+/g, ' '); 
    const today = new Date().toISOString().split('T')[0];

    const prompt = `
    Extract event details as JSON.
    CONTEXT: Today is ${today}.
    
    RULES:
    1. "date": YYYY-MM-DD. 
    2. "time": HH:MM AM/PM.
    3. "venue": Location.
    4. "link": Extract ANY registration URL (look for http/https links like forms.google, bit.ly, lu.ma, unstop, etc). If multiple, pick the most relevant registration one. If none, return null.
    
    JSON: { "title": "", "date": "", "time": "", "venue": "", "link": "", "summary": "" }
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
    console.log("🔄 Fetching emails...");
    try {
        const gmail = getGmailClient();
        
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 20, 
            q: 'subject:(event OR session OR hackathon OR contest OR competition OR club OR webinar OR workshop OR internship) newer_than:2d' 
        });

        const messages = response.data.messages || [];
        
        if (messages.length === 0) {
            console.log("📭 No recent emails.");
            return res.json({ success: true, events: [] });
        }

        const processedEvents = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const msg of messages) {
            let eventData;
            const cache = loadCache();

            // Fetch FULL email to get the body content
            const email = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
            
            // --- FIX: USE DECODED BODY, NOT SNIPPET ---
            let fullText = getEmailBody(email.data.payload);
            
            // Fallback to snippet if body extraction failed
            if (!fullText || fullText.length < 10) {
                fullText = email.data.snippet;
            }

            if (cache[msg.id]) {
                eventData = cache[msg.id];
            } else {
                console.log(`🤖 Analyzing: ${msg.id}...`);
                // Pass the FULL TEXT now
                eventData = await parseWithGemini(fullText, msg.id);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (!eventData || !eventData.date) continue;

            const eventDate = new Date(eventData.date);
            if (isNaN(eventDate.getTime())) continue;

            if (eventDate < today) continue; 

            processedEvents.push({ id: msg.id, ...eventData });
        }

        console.log(`🚀 Sending ${processedEvents.length} events.`);
        res.json({ success: true, events: processedEvents });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));