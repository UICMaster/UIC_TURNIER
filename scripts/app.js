const API_PATH = './data/generated/db.json';

document.addEventListener('DOMContentLoaded', initSystem);

async function initSystem() {
    try {
        // Cache Buster ist CRITICAL für Live-Updates
        const response = await fetch(`${API_PATH}?t=${Date.now()}`);
        if (!response.ok) throw new Error("Database Access Denied");
        
        const db = await response.json();
        renderView(db);

    } catch (error) {
        console.error("System Failure:", error);
        document.body.innerHTML = "<h1 style='color:red; text-align:center; margin-top:50px;'>SYSTEM OFFLINE</h1>";
    }
}

function renderView(db) {
    const status = db.meta.status; // UPCOMING, LIVE, NONE
    const views = ['view-none', 'view-upcoming', 'view-live'];
    
    // Reset Views
    views.forEach(v => document.getElementById(v).classList.add('hidden'));

    // Activate current view
    const activeView = document.getElementById(`view-${status.toLowerCase()}`);
    if(activeView) activeView.classList.remove('hidden');

    // Logic Dispatcher
    if (status === 'UPCOMING') {
        setupCountdown(db.meta.start_date_iso);
        document.getElementById('event-title').innerText = db.meta.title;
        document.getElementById('reg-link').href = db.meta.registration_link;
    } 
    else if (status === 'LIVE') {
        document.getElementById('live-title').innerText = db.meta.title;
        renderBracket(db.bracket, db.teams);
    }
}

/* --- LOGIC: BRACKET RENDERER --- */
function renderBracket(matches, teams) {
    matches.forEach(match => {
        // Wir suchen im HTML nach dem Container für dieses Match
        const matchEl = document.getElementById(`match-${match.match_id}`);
        if (!matchEl) return; 

        // Helper Funktion für Team Daten
        const getTeam = (id) => teams[id] || { acronym: 'TBD', name: 'To Be Decided', logo: null };

        const t1 = getTeam(match.team_1_id);
        const t2 = getTeam(match.team_2_id);

        // HTML Injection
        matchEl.innerHTML = `
            <div class="team-row ${match.winner_id === match.team_1_id ? 'winner' : ''}">
                <div class="flex-center">
                    ${t1.logo ? `<img src="${t1.logo}" class="t-logo">` : ''}
                    <span class="t-name">${t1.acronym}</span>
                </div>
                <span class="t-score">${match.score_1}</span>
            </div>
            <div class="team-row ${match.winner_id === match.team_2_id ? 'winner' : ''}">
                <div class="flex-center">
                    ${t2.logo ? `<img src="${t2.logo}" class="t-logo">` : ''}
                    <span class="t-name">${t2.acronym}</span>
                </div>
                <span class="t-score">${match.score_2}</span>
            </div>
        `;
        
        // Live Status Indicator im Match
        if(match.status === 'LIVE') matchEl.classList.add('match-active');
    });
}

/* --- LOGIC: COUNTDOWN --- */
function setupCountdown(isoDate) {
    const target = new Date(isoDate).getTime();
    
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const diff = target - now;

        if (diff < 0) {
            clearInterval(timer);
            location.reload(); 
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById('cd-timer').innerHTML = 
            `<span class="time-unit">${d}d</span> : <span class="time-unit">${h}h</span> : <span class="time-unit">${m}m</span> : <span class="time-unit">${s}s</span>`;
    }, 1000);
}
