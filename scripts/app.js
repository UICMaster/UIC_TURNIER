const API_PATH = './data/generated/db.json';

document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        // Cache Buster für Live Updates
        const res = await fetch(`${API_PATH}?t=${Date.now()}`);
        if (!res.ok) throw new Error("DB Error");
        const db = await res.json();
        
        // Status Weiche
        const s = db.meta.status;
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

        if (s === 'UPCOMING') {
            document.getElementById('view-upcoming').classList.remove('hidden');
            setupTimer(db.meta.start_date_iso);
            document.getElementById('event-title').innerText = db.meta.title;
            document.getElementById('reg-link').href = db.meta.registration_link;
        } else if (s === 'LIVE' || s === 'FINISHED') {
            document.getElementById('view-live').classList.remove('hidden');
            document.getElementById('live-title').innerText = db.meta.title;
            
            // --- NEU 1: Twitch Player Integration ---
            const streamLink = db.meta.stream_link;
            const twitchContainer = document.getElementById('twitch-container');
            // Zeigt Twitch nur im "LIVE" Modus, nicht wenn das Turnier schon "FINISHED" ist
            if (s === 'LIVE' && streamLink && streamLink.includes('twitch.tv/')) {
                const channel = streamLink.split('twitch.tv/')[1].split('/')[0];
                const hostname = window.location.hostname || 'localhost'; // Wichtig für Twitch Embed
                twitchContainer.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${channel}&parent=${hostname}&muted=false" allowfullscreen></iframe>`;
                twitchContainer.classList.remove('hidden');
            } else {
                twitchContainer.classList.add('hidden');
                twitchContainer.innerHTML = '';
            }

            // Bracket Zeichnen
            renderBracket(db.bracket, db.teams);

            // --- NEU 2: Hover-Effekte aktivieren ---
            setupHoverEffects();

            // --- NEU 3: Champion Screen Check ---
            checkChampion(db.bracket, db.teams);

        } else {
            document.getElementById('view-none').classList.remove('hidden');
        }
    } catch (e) {
        console.error(e);
    }
}

function renderBracket(matches, teams) {
    const wb = document.getElementById('bracket-winners');
    const lb = document.getElementById('bracket-losers');
    wb.innerHTML = ''; lb.innerHTML = '';

    const wMatches = matches.filter(m => m.type === 'WINNER');
    const lMatches = matches.filter(m => m.type === 'LOSER');

    buildColumnTree(wb, wMatches, teams, "WINNER");
    
    if (lMatches.length > 0) buildColumnTree(lb, lMatches, teams, "LOSER");
    else document.getElementById('lbl-losers').classList.add('hidden');
}

function buildColumnTree(container, matches, teams, type) {
    const maxR = Math.max(...matches.map(m => m.round));
    for (let r = 1; r <= maxR; r++) {
        const col = document.createElement('div');
        col.className = 'round-column';
        
        const head = document.createElement('div');
        head.className = 'round-header';
        head.innerText = getRoundName(r, maxR, type);
        col.appendChild(head);

        matches.filter(m => m.round === r).forEach(m => {
            col.appendChild(createCard(m, teams));
        });
        container.appendChild(col);
    }
}

function createCard(m, teams) {
    const div = document.createElement('div');
    div.className = 'match-card'; // Habe card Klassen bereinigt
    div.id = `match-${m.id}`; 
    
    if (m.status === 'LIVE') div.classList.add('is-live');
    if (m.is_grand_final) div.classList.add('grand-final'); // Grand Final Optik

    const t1 = resolve(m.team_1, teams);
    const t2 = resolve(m.team_2, teams);

    const t1Winner = m.winner_id === m.team_1 && m.team_1 !== '[BYE]' && m.team_1 !== null;
    const t2Winner = m.winner_id === m.team_2 && m.team_2 !== '[BYE]' && m.team_2 !== null;
    
    const t1Loser = (!m.team_1 || m.team_1 === '[BYE]' || (m.winner_id && !t1Winner));
    const t2Loser = (!m.team_2 || m.team_2 === '[BYE]' || (m.winner_id && !t2Winner));

    // data-team-id hinzugefügt für das Hover-Highlighting
    div.innerHTML = `
        <div class="team-row ${t1Winner ? 'winner' : ''} ${t1Loser ? 'loser' : ''}" data-team-id="${m.team_1 || ''}">
            <div class="flex-center">
                ${t1.logo ? `<img src="${t1.logo}" class="t-logo">` : ''}
                <span class="t-name">${t1.name}</span>
            </div>
            <span class="t-score">${m.score_1}</span>
        </div>
        <div class="team-row ${t2Winner ? 'winner' : ''} ${t2Loser ? 'loser' : ''}" data-team-id="${m.team_2 || ''}">
             <div class="flex-center">
                ${t2.logo ? `<img src="${t2.logo}" class="t-logo">` : ''}
                <span class="t-name">${t2.name}</span>
            </div>
            <span class="t-score">${m.score_2}</span>
        </div>
    `;
    return div;
}

function resolve(id, teams) {
    if (id === '[BYE]') return { name: 'FREILOS', logo: null };
    if (!id) return { name: 'TBD', logo: null }; 
    if (!teams[id]) return { name: 'TBD', logo: null }; 
    return teams[id];
}

function getRoundName(r, max, type) {
    if (type === 'LOSER') return `L-RUNDE ${r}`;
    if (r === max) return "FINALE";
    if (r === max - 1) return "HALBFINALE";
    if (r === max - 2) return "VIERTELFINALE";
    return `RUNDE ${r}`;
}

function setupTimer(iso) {
    const target = new Date(iso).getTime();
    setInterval(() => {
        const diff = target - new Date().getTime();
        if (diff < 0) return document.getElementById('countdown').innerText = "BEREIT";
        
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        document.getElementById('countdown').innerText = `${d}T ${h}H ${m}M ${s}S`;
    }, 1000);
}

// ============================================================================
// NEUE FUNKTIONEN: HOVER & CHAMPION
// ============================================================================

function setupHoverEffects() {
    document.querySelectorAll('.bracket-scroll-wrapper').forEach(wrapper => {
        // Verhindert doppelte Event-Listener
        if (wrapper.dataset.hoverBound) return;
        wrapper.dataset.hoverBound = "true";

        wrapper.addEventListener('mouseover', (e) => {
            const row = e.target.closest('.team-row');
            if (!row) return;
            
            const teamId = row.getAttribute('data-team-id');
            // Keine Highlights für leere Slots oder Freilose
            if (!teamId || teamId === '[BYE]') return;

            wrapper.classList.add('is-hovering');
            
            // Finde alle Matches, in denen dieses Team spielt, und lass sie leuchten
            wrapper.querySelectorAll('.match-card').forEach(card => {
                const t1 = card.querySelector('.team-row:first-child').getAttribute('data-team-id');
                const t2 = card.querySelector('.team-row:last-child').getAttribute('data-team-id');
                if (t1 === teamId || t2 === teamId) {
                    card.classList.add('highlight-match');
                }
            });
        });

        wrapper.addEventListener('mouseout', () => {
            wrapper.classList.remove('is-hovering');
            wrapper.querySelectorAll('.highlight-match').forEach(card => {
                card.classList.remove('highlight-match');
            });
        });
    });
}

function checkChampion(bracket, teams) {
    // Finde das Grand Final
    const gf = bracket.find(m => m.is_grand_final);
    
    // Wenn das Finale beendet ist und einen Gewinner hat
    if (gf && gf.status === 'FINISHED' && gf.winner_id) {
        const champ = resolve(gf.winner_id, teams);
        
        document.getElementById('champ-name').innerText = champ.name;
        if (champ.logo) {
            document.getElementById('champ-logo').src = champ.logo;
            document.getElementById('champ-logo').style.display = 'block';
        } else {
            document.getElementById('champ-logo').style.display = 'none';
        }

        // Zeige den epischen Screen an
        document.getElementById('champion-screen').classList.remove('hidden');

        // Erlaube dem User, das Overlay zu schließen, um das finale Bracket zu sehen
        document.getElementById('close-champ').onclick = () => {
            document.getElementById('champion-screen').classList.add('hidden');
        };
    }
}