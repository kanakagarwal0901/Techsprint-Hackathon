# 🏔️ MandiSync
**From Inbox to Calendar, Instantly.**

> *Built for TechSprint Hackathon 2025*

## 🚨 The Problem
Campus life is chaotic. Students at IIT Mandi receive dozens of emails daily—hackathons, club meets, guest lectures, and academic deadlines.
* **Inbox Overload:** Critical event details get buried in long email threads.
* **Scheduling Clashes:** Students often unknowingly double-book themselves for events happening at the same time.
* **Manual Effort:** Copy-pasting details from Gmail to a calendar is tedious and error-prone.

## 💡 The Solution
**MandiSync** is an AI-powered automated scheduler. It connects directly to your student Gmail, reads your emails using **Google Gemini AI**, and intelligently extracts key details (Date, Time, Venue, Registration Links).

It doesn't just list events; it organizes your life by automatically detecting conflicts and providing direct registration access.

## ✨ Key Features
* **🤖 AI Event Extraction:** Uses `Gemini 1.5 Flash` to parse unstructured email text and extract structured event data (Title, Date, Time, Venue).
* **⚠️ Smart Clash Detection:** Automatically flags conflicting events with a "⚠️ Clash Detected" tag if they overlap within a 2-hour window.
* **🔗 Auto-Link Discovery:** If the email contains a registration URL (Google Forms, Luma, etc.), a **"Register Now"** button is automatically generated.
* **📅 Unified Dashboard:** A visual Master Calendar that filters events by location (North vs. South Campus).
* **➕ Personal Scheduling:** Users can manually add their own events, which persist in local storage and are checked for clashes against AI-fetched events.
* **🧹 Smart Filters:** Automatically hides past events and allows users to search specifically for "Clashes Only" to resolve conflicts.

## 🛠️ Tech Stack
* **Frontend:** React.js, CSS3 (Custom animations)
* **Backend:** Node.js, Express.js
* **AI Engine:** Google Gemini 2.5 Flash
* **Integration:** Gmail API (OAuth 2.0)
* **Data Handling:** Intelligent JSON Caching (Server-side) & LocalStorage (Client-side)

## 🚀 How to Run

### 1. Backend Setup
```bash
cd mandisync-backend
npm install
# Create .env file with GEMINI_API_KEY
node server.js

### 2. Frontend Setup
```bash
cd mandisync-frontend
npm install
npm start

Team:- 404 not found