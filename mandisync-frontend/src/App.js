import React, { useState, useEffect } from 'react';
import './App.css'; 

// --- HELPER: TIME PARSING & CLASH DETECTION ---
const parseDateTime = (dateStr, timeStr) => {
    try {
        if (!dateStr || !timeStr) return 0;
        const d = new Date(dateStr);
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
        
        d.setHours(hours, minutes, 0, 0);
        return d.getTime();
    } catch (e) {
        return 0; 
    }
};

const markClashes = (eventsList) => {
    const cleanEvents = eventsList.map(e => ({ ...e, clash: false }));

    for (let i = 0; i < cleanEvents.length; i++) {
        for (let j = i + 1; j < cleanEvents.length; j++) {
            const eventA = cleanEvents[i];
            const eventB = cleanEvents[j];

            if (!eventA.date || !eventB.date || eventA.date !== eventB.date) continue;

            const timeA = parseDateTime(eventA.date, eventA.time);
            const timeB = parseDateTime(eventB.date, eventB.time);

            if (timeA === 0 || timeB === 0) continue;

            const diffInHours = Math.abs(timeA - timeB) / 36e5;

            if (diffInHours < 2) { 
                cleanEvents[i].clash = true;
                cleanEvents[j].clash = true;
            }
        }
    }
    return cleanEvents;
};

// --- HELPER: LOCAL STORAGE MANAGER ---
const getStoredEvents = () => {
    const stored = localStorage.getItem('manualEvents');
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    const now = new Date().getTime();

    const validEvents = parsed.filter(e => {
        const eventTime = parseDateTime(e.date, e.time);
        return eventTime > now || eventTime === 0; 
    });

    if (validEvents.length !== parsed.length) {
        localStorage.setItem('manualEvents', JSON.stringify(validEvents));
    }

    return validEvents;
};

// --- 1. LOGIN PAGE COMPONENT ---
const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setIsAnimating(true);
    setError("");

    setTimeout(() => {
      if (email.endsWith("@iitmandi.ac.in") || email.endsWith("@students.iitmandi.ac.in") || email === "test") {
        onLogin(email === "test" ? "judge@iitmandi.ac.in" : email); 
      } else {
        setError("⚠️ Please use your official IIT Mandi email ID.");
        setIsAnimating(false);
      }
    }, 800); 
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Mandi<span className="highlight">Sync</span></h1>
          <p>From Inbox to Calendar, Instantly</p>
        </div>
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Student Email</label>
            <input 
              type="text" 
              placeholder="b22xxx@students.iitmandi.ac.in" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="login-btn" disabled={isAnimating}>
            {isAnimating ? "Verifying..." : "Continue with Google"}
          </button>
        </form>
        <div className="login-footer"><p>Your Inbox Decoded. Your Day Sorted</p></div>
      </div>
    </div>
  );
};

// --- 2. DASHBOARD COMPONENT ---
const Dashboard = ({ user, onLogout }) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('All'); 
  const [showClashesOnly, setShowClashesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", date: "", time: "", venue: "", link: "", summary: "" });

  useEffect(() => {
    const fetchAllData = async () => {
      let combinedEvents = [];
      const manualEvents = getStoredEvents();
      combinedEvents = [...manualEvents];

      try {
        console.log("📡 Frontend: Requesting backend data...");
        
        // --- ⚡ HACKATHON FIX: HARDCODED URL ---
        // This forces the app to look at your live Render server
        const API_BASE = 'https://mandisync-backend.onrender.com';
        
        const response = await fetch(`${API_BASE}/api/refresh-events`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.events)) {
                const apiEvents = data.events.map(e => ({
                    id: e.id || Math.random(),
                    title: e.title || "Untitled Event",
                    date: e.date, 
                    time: e.time || "Time TBD",
                    venue: e.venue || "Campus",
                    link: e.link || null,
                    summary: e.summary || "No details available.",
                    urgent: e.urgent || false,
                    clash: false, 
                    isThisWeek: true 
                }));
                combinedEvents = [...manualEvents, ...apiEvents];
            }
        }
      } catch (error) {
        console.error("❌ Backend failed, showing local only:", error);
      } finally {
        setEvents(markClashes(combinedEvents));
        setLoading(false);
      }
    };
    fetchAllData();
  }, []);

  const handleAddEvent = (e) => {
    e.preventDefault();
    const manualEvent = {
        id: Math.random(), 
        ...newEvent,
        urgent: false,
        clash: false,
        isThisWeek: true,
        isManual: true 
    };
    
    const currentStored = getStoredEvents();
    const updatedStored = [manualEvent, ...currentStored];
    localStorage.setItem('manualEvents', JSON.stringify(updatedStored));

    const updatedList = [manualEvent, ...events];
    setEvents(markClashes(updatedList)); 

    setIsModalOpen(false); 
    setNewEvent({ title: "", date: "", time: "", venue: "", link: "", summary: "" }); 
  };

  const clashCount = events.filter(e => e.clash).length;

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="logo">
          <span className="logo-text">🏔️ Mandi<span className="highlight">Sync</span></span>
        </div>
        <div className="nav-controls">
            <button 
                className={`clash-toggle-btn ${showClashesOnly ? 'active' : ''}`}
                onClick={() => setShowClashesOnly(!showClashesOnly)}
            >
                {showClashesOnly ? 'Show All' : `⚠️ Clashes (${clashCount})`}
            </button>
            <div className="user-profile">
                <span>{user.split('@')[0]}</span>
            </div>
            <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className="dashboard">
        <div className="dashboard-header">
          <h1>{showClashesOnly ? '⚠️ Conflicting Events' : '🗓️ Calendar'}</h1>
          <div className="filter-controls">
            <button className={filter === 'All' ? 'active' : ''} onClick={() => setFilter('All')}>All</button>
            <button className={filter === 'North' ? 'active' : ''} onClick={() => setFilter('North')}>North</button>
            <button className={filter === 'South' ? 'active' : ''} onClick={() => setFilter('South')}>South</button>
          </div>
        </div>

        {loading && <div className="loading-state">🔄 Syncing with your Inbox...</div>}

        {!loading && (
            <div className="event-grid">
            {events
                .filter(e => {
                    const venueText = e.venue ? e.venue.toLowerCase() : "";
                    const filterText = filter.toLowerCase();

                    const matchesLoc = filter === 'All' || venueText.includes(filterText);
                    const matchesClash = showClashesOnly ? e.clash === true : true;
                    return matchesLoc && matchesClash;
                })
                .map(event => <EventCard key={event.id} data={event} />)}
            
            {events.length === 0 && <p className="empty-state">No events found in your inbox.</p>}
            </div>
        )}

        <button className="fab-btn" onClick={() => setIsModalOpen(true)}>+</button>

        {isModalOpen && (
            <div className="modal-overlay">
                <div className="modal-content">
                    <h2>Add New Event</h2>
                    <form onSubmit={handleAddEvent}>
                        <input 
                            placeholder="Event Title" 
                            value={newEvent.title} 
                            onChange={e => setNewEvent({...newEvent, title: e.target.value})} 
                            required 
                        />
                        <div className="form-row">
                            <input 
                                type="date" 
                                value={newEvent.date} 
                                onChange={e => setNewEvent({...newEvent, date: e.target.value})} 
                                required 
                            />
                            <input 
                                type="time" 
                                value={newEvent.time} 
                                onChange={e => setNewEvent({...newEvent, time: e.target.value})} 
                                required 
                            />
                        </div>
                        <input 
                            placeholder="Venue (e.g. North Campus)" 
                            value={newEvent.venue} 
                            onChange={e => setNewEvent({...newEvent, venue: e.target.value})} 
                            required 
                        />
                        
                        <input 
                            placeholder="Registration Link (Optional)" 
                            value={newEvent.link} 
                            onChange={e => setNewEvent({...newEvent, link: e.target.value})} 
                        />
                        
                        <textarea 
                            placeholder="Short Summary" 
                            value={newEvent.summary} 
                            onChange={e => setNewEvent({...newEvent, summary: e.target.value})} 
                        />
                        <div className="modal-actions">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="cancel-btn">Cancel</button>
                            <button type="submit" className="save-btn">Save Event</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

// --- 3. EVENT CARD COMPONENT ---
const EventCard = ({ data }) => {
  let month = "TBD";
  let day = "--";

  if (data.date) {
    const parts = data.date.split('-'); 
    if (parts.length === 3) {
      const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const monthIndex = parseInt(parts[1], 10) - 1; 
      if (monthNames[monthIndex]) {
        month = monthNames[monthIndex];
        day = parts[2];
      }
    }
  }

  return (
    <div className={`event-card ${data.isThisWeek ? 'glow-border' : ''} ${data.clash ? 'clash-border' : ''}`}>
      <div className="date-badge">
        <span className="month">{month}</span>
        <span className="day">{day}</span>
      </div>
      <div className="card-content">
        <div className="card-header">
          {data.urgent && <span className="tag urgent">Urgent</span>}
          {data.clash && <span className="tag clash">⚠️ Clash Detected</span>}
          {data.isManual && <span className="tag manual" style={{background:'#4CAF50', color:'white', marginLeft:'5px', padding:'2px 6px', borderRadius:'4px', fontSize:'0.7rem'}}>My Event</span>}
        </div>
        <h3 className="event-title">{data.title}</h3>
        <div className="event-details">
          <p>🕒 {data.time}</p>
          <p>📍 {data.venue}</p>
        </div>
        <div className="tldr-box"><strong>Subject: </strong> {data.summary}</div>
        
        {data.link && data.link !== "null" && data.link !== "" ? (
            <a 
                href={data.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="register-btn"
                style={{display:'flex', justifyContent:'center', textDecoration:'none',alignContent:"center"}}
            >
                Register Now
            </a>
        ) : null}
      
      </div>
    </div>
  );
};

// --- 4. MAIN APP ---
function App() {
  const [user, setUser] = useState(null);
  if (!user) return <LoginPage onLogin={setUser} />;
  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

export default App;