const API_PATH = './data/generated/db.json';

document.addEventListener('DOMContentLoaded', initSystem);

async function initSystem() {
    try {
        const response = await fetch(`${API_PATH}?t=${Date.now()}`);
        const db = await response.json();
        
        // Routing
        const status = db.meta.status; 
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        
        if (status === 'UPCOMING') {
            document.getElementById('view-upcoming').classList.remove('hidden');
            setupCountdown(db.meta.start_date_iso);
            document.getElementById('event-title').innerText = db.meta.title;
            document.getElementById('reg-link').href = db.meta.registration_link;
        } 
        else if (status === 'LIVE' || status === 'FINISHED') {
            document.getElementById('view-live').classList.remove('hidden');
            document.getElementById('live-title').innerText = db.meta.title;
            renderDynamicBracket(db.bracket, db.teams);
        }
        else {
            document.getElementById('view-none').classList.remove('hidden');
        }

    } catch (error) {
        console.error("Systemfehler:", error);
    }
}

function renderDynamicBracket(matches, teams) {
    // Container leeren
    const wbContainer = document.getElementById('bracket-winners');
    const lbContainer = document.getElementById('bracket-losers');
    wbContainer.innerHTML = ''; 
    lbContainer.innerHTML = '';

    // Sortieren & Filtern
    const winners = matches.filter(m => m.type === 'WINNER');
    const losers = matches.filter(m => m.type === 'LOSER');

    // Winner Bracket Bauen
    buildTree(wbContainer, winners, teams, "WINNER");
    // Loser Bracket Bauen (falls vorhanden)
    if(losers.length > 0) buildTree(lbContainer, losers, teams, "LOSER");
    else document.getElementById('lbl-losers').classList.add('hidden');
}

function buildTree(container, matches, teams, type) {
    const maxRound = Math.max(...matches.map(m => m.round));

    for (let r = 1; r <= maxRound; r++) {
        const roundMatches = matches.filter(m => m.round === r);
        
        // Spalte erstellen
        const col = document.createElement('div');
        col.className = 'round-column';
        
        // Header (Deutsch)
        const header = document.createElement('div');
        header.className = 'round-header';
        header.innerText = getGermanRoundName(r, maxRound, type);
        col.appendChild(header);

        // Matches einfügen
        roundMatches.forEach(match => {
            col.appendChild(createMatchCard(match, teams));
        });

        container.appendChild(col);
    }
}

function createMatchCard(match, teams) {
    const div = document.createElement('div');
    div.className = 'match-card card card--hud';
    if (match.status === 'LIVE') div.classList.add('is-live');

    const t1 = resolveTeam(match.team_1, teams);
    const t2 = resolveTeam(match.team_2, teams);

    div.innerHTML = `
        <div class="team-row ${match.winner_id === match.team_1 && match.team_1 ? 'winner' : ''} ${!match.team_1 ? 'loser' : ''}">
            <div class="flex-center">
                ${t1.logo ? `<img src="${t1.logo}" class="t-logo">` : ''}
                <span class="t-name">${t1.name}</span>
            </div>
            <span class="t-score">${match.score_1}</span>
        </div>
        <div class="team-row ${match.winner_id === match.team_2 && match.team_2 ? 'winner' : ''} ${!match.team_2 ? 'loser' : ''}">
            <div class="flex-center">
                ${t2.logo ? `<img src="${t2.logo}" class="t-logo">` : ''}
                <span class="t-name">${t2.name}</span>
            </div>
            <span class="t-score">${match.score_2}</span>
        </div>
    `;
    return div;
}

function resolveTeam(id, teams) {
    if (!id) return { name: 'FREILOS', logo: null };
    if (!teams[id]) return { name: 'OFFEN', logo: null };
    return teams[id];
}

function getGermanRoundName(current, total, type) {
    if (type === 'LOSER') return `L-Runde ${current}`;
    if (current === total) return "FINALE";
    if (current === total - 1) return "HALBFINALE";
    if (current === total - 2) return "VIERTELFINALE";
    return `Runde ${current}`;
}

// Countdown (Kurzform)
function setupCountdown(date) { /* Dein bestehender Countdown Code hier */ }
