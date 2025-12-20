import React, { useState, useEffect } from 'react';
import './App.css'; 

// --- MOCK DATA ---
const MOCK_EVENTS = [
  {
    id: 1,
    title: "Hackathon 2025: Build for Bharat",
    date: "2025-10-24",
    time: "10:00 AM",
    venue: "North Campus, A1 Hall",
    summary: "Annual hackathon focused on rural tech solutions. Teams of 4.",
    link: "#",
    urgent: true, 
    clash: true, // This one has a clash
    isThisWeek: true
  },
  {
    id: 2,
    title: "Guest Lecture: AI in Healthcare",
    date: "2025-10-26",
    time: "05:00 PM",
    venue: "South Campus, CV Raman",
    summary: "Dr. Sharma from AIIMS discusses diagnostic AI models.",
    link: "#",
    urgent: false,
    clash: false,
    isThisWeek: true
  },
  {
    id: 3,
    title: "Inter-IIT Sports Meet Briefing",
    date: "2025-11-02",
    time: "06:30 PM",
    venue: "North Campus, Sports Complex",
    summary: "Mandatory briefing for all selected athletes.",
    link: "#",
    urgent: false,
    clash: false,
    isThisWeek: false
  }
];

function App() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('All'); 
  const [showClashesOnly, setShowClashesOnly] = useState(false); // NEW STATE

  useEffect(() => {
    setEvents(MOCK_EVENTS);
  }, []);

  // Calculate number of clashes for the button badge
  const clashCount = events.filter(e => e.clash).length;

  return (
    <div className="app-container">
      {/* --- HEADER --- */}
      <header className="navbar">
        <div className="logo">
          <span className="logo-text">Mandi<span className="highlight">Sync</span></span>
        </div>
        
        {/* RIGHT SIDE: Clash Button + Profile */}
        <div className="nav-controls">
            {/* NEW CLASH BUTTON */}
            <button 
                className={`clash-toggle-btn ${showClashesOnly ? 'active' : ''}`}
                onClick={() => setShowClashesOnly(!showClashesOnly)}
            >
                {showClashesOnly ? 'Show All Events' : `⚠️ Clashes (${clashCount})`}
            </button>

            <div className="user-profile">
                <span>Student ID: B22104</span>
            </div>
        </div>
      </header>

      {/* --- MAIN DASHBOARD --- */}
      <main className="dashboard">
        
        <div className="dashboard-header">
          <h1>{showClashesOnly ? '⚠️ Conflicting Events' : 'Master Calendar'}</h1>
          
          {/* Hide location filters if viewing clashes to avoid confusion, or keep them. keeping them for now. */}
          <div className="filter-controls">
            <button className={filter === 'All' ? 'active' : ''} onClick={() => setFilter('All')}>All</button>
            <button className={filter === 'North' ? 'active' : ''} onClick={() => setFilter('North')}>North</button>
            <button className={filter === 'South' ? 'active' : ''} onClick={() => setFilter('South')}>South</button>
          </div>
        </div>

        {/* --- EVENT GRID --- */}
        <div className="event-grid">
          {events
            .filter(e => {
                // 1. Check Location Filter
                const matchesLoc = filter === 'All' || e.venue.includes(filter);
                // 2. Check Clash Filter (If button is active, only show true clashes)
                const matchesClash = showClashesOnly ? e.clash === true : true;
                return matchesLoc && matchesClash;
            })
            .map(event => (
            <EventCard key={event.id} data={event} />
          ))}
        </div>
      </main>
    </div>
  );
}

// --- COMPONENT: Event Card (Unchanged) ---
const EventCard = ({ data }) => {
  const dateObj = new Date(data.date);
  const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = dateObj.getDate();

  return (
    <div className={`event-card ${data.isThisWeek ? 'glow-border' : ''}`}>
      <div className="date-badge">
        <span className="month">{month}</span>
        <span className="day">{day}</span>
      </div>
      <div className="card-content">
        <div className="card-header">
          {data.urgent && <span className="tag urgent">Urgent</span>}
          {data.clash && <span className="tag clash">⚠️ Clash Detected</span>}
        </div>
        <h3 className="event-title">{data.title}</h3>
        <div className="event-details">
          <p>🕒 {data.time}</p>
          <p>📍 {data.venue}</p>
        </div>
        <div className="tldr-box">
          <strong>TL;DR:</strong> {data.summary}
        </div>
        <button className="register-btn">Register Now</button>
      </div>
    </div>
  );
};

export default App;