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

// --- DEPLOYMENT HELPER: Create secrets from Env Vars ---
// This allows us to paste JSON content into Render Environment Variables
if (process.env.GOOGLE_CREDENTIALS_JSON && !fs.existsSync(CREDENTIALS_PATH)) {
    console.log("📝 Creating credentials.json from Environment Variable...");
    fs.writeFileSync(CREDENTIALS_PATH, process.env.GOOGLE_CREDENTIALS_JSON);
}

if (process.env.GOOGLE_TOKEN_JSON && !fs.existsSync(TOKEN_PATH)) {
    console.log("📝 Creating token.json from Environment Variable...");
    fs.writeFileSync(TOKEN_PATH, process.env.GOOGLE_TOKEN_JSON);
}

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

// ... inside server.js ...

app.get('/api/refresh-events', async (req, res) => {
    console.log("🔄 API Request Received: /api/refresh-events");
    try {
        if (!fs.existsSync(TOKEN_PATH)) {
            console.error("❌ Auth Token missing.");
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // 1. Fetch Emails (Query broadened to catch your events)
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: 'newer_than:15d (subject:hackathon OR subject:workshop OR subject:meet OR subject:session OR subject:quiz OR subject:contest OR subject:event OR subject:invitation OR "Dear Students")',
            maxResults: 15,
        });

        const messages = response.data.messages || [];
        console.log(`🔎 Found ${messages.length} matching emails.`);

        const emails = [];

        // 2. Process Each Email Safely
        for (const message of messages) {
            try {
                const msg = await gmail.users.messages.get({ userId: 'me', id: message.id });
                const headers = msg.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const snippet = msg.data.snippet;

                console.log(`   👉 Analyzing: "${subject}"...`);

                const prompt = `
                Analyze this email for an event.
                Current Date: ${new Date().toDateString()}.
                Subject: "${subject}"
                Snippet: "${snippet}"
                
                Return ONLY a JSON object (no markdown, no extra text).
                Format:
                {
                  "title": "Short title",
                  "date": "YYYY-MM-DD",
                  "time": "HH:MM AM/PM",
                  "venue": "Venue",
                  "link": "Link or null",
                  "summary": "Summary",
                  "urgent": false
                }
                If no event, return null.
                `;

                const result = await model.generateContent(prompt);
                let text = result.response.text();

                // 3. IMPROVED JSON CLEANER (The Magic Fix) 🧹
                // This removes ```json and ``` marks, and finds the first '{' and last '}'
                text = text.replace(/```json/g, '').replace(/```/g, '');
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                
                if (firstBrace !== -1 && lastBrace !== -1) {
                    const jsonString = text.substring(firstBrace, lastBrace + 1);
                    const eventData = JSON.parse(jsonString);

                    if (eventData) {
                        emails.push({ id: message.id, ...eventData });
                        console.log(`      ✅ Success: Added "${eventData.title}"`);
                    } else {
                        console.log(`      ⚠️ Skipped: AI returned null (Not an event)`);
                    }
                } else {
                    console.log(`      ❌ Error: AI response was not valid JSON.`);
                }

            } catch (innerError) {
                // This catch block prevents the whole server from crashing if one email fails!
                console.error(`      ❌ FAILED processing email ${message.id}:`, innerError.message);
            }
        }

        console.log(`🚀 Sending ${emails.length} events to frontend.`);
        res.json({ success: true, events: emails });

    } catch (error) {
        console.error("🔥 CRITICAL SERVER ERROR:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));