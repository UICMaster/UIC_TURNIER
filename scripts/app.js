const API_PATH = './data/generated/db.json';

// --- NEU: Globale Variablen für unser Geister-Update ---
let currentDbString = null; 
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', drawBracketLines); // Zeichnet Linien neu, wenn das Fenster vergrößert wird

async function init() {
    // 1. Erster Ladevorgang (sofort beim Öffnen der Seite)
    await fetchAndRender();
    
    // 2. Geister-Updates: Alle 30 Sekunden lautlos im Hintergrund prüfen (30000 Millisekunden)
    setInterval(fetchAndRender, 30000); 
}

// --- NEU: Die Funktion, die im Hintergrund lauscht ---
async function fetchAndRender() {
    try {
        const res = await fetch(`${API_PATH}?t=${Date.now()}`);
        if (!res.ok) throw new Error("DB Error");
        
        const text = await res.text();
        
        // DIE MAGIE: Ist der Text exakt gleich wie vor 30 Sekunden? Dann brich ab!
        if (currentDbString === text) return; 
        
        // Es gab ein Update! Seite neu bauen.
        currentDbString = text;
        const db = JSON.parse(text);
        
        updateUI(db);
        
    } catch (e) {
        console.error("Geister-Update fehlgeschlagen:", e);
    }
}

// Hier steckt jetzt deine bisherige Start-Logik drin
function updateUI(db) {
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
        
        // 1. Render Team Stream Cards
        renderTeamStreams(db.teams);

        // 2. Render Bracket
        renderBracket(db.bracket, db.teams);

        // 3. Hover-Effekte aktivieren
        setupHoverEffects();

        // 4. Champion Screen Check
        checkChampion(db.bracket, db.teams);

    } else {
        document.getElementById('view-none').classList.remove('hidden');
    }
}

// --- NEU: Team Stream Cards generieren ---
function renderTeamStreams(teams) {
    const container = document.getElementById('team-streams-container');
    container.innerHTML = '';
    
    // Konvertiert das Object in ein Array und wirft Freilose raus
    const teamsArray = Object.values(teams).filter(t => t.id !== '[BYE]');
    
    if(teamsArray.length === 0) return;
    
    container.classList.remove('hidden');

    teamsArray.forEach(t => {
        // Wir prüfen, ob ein Team einen Link oder einen "live"-Status hat
        const hasStream = !!t.stream_link;
        const isLive = t.is_live === true; 
        
        // Karte nur anzeigen, wenn es überhaupt einen Stream Link gibt
        if (!hasStream) return;

        const a = document.createElement('a');
        a.className = 'stream-card';
        a.href = t.stream_link;
        a.target = '_blank';
        
        a.innerHTML = `
            ${t.logo ? `<img src="${t.logo}" class="stream-avatar">` : `<div class="stream-avatar"></div>`}
            <div class="stream-info">
                <span class="stream-name">${t.name}</span>
                <span class="stream-status ${isLive ? 'is-live' : ''}">
                    ${isLive ? '<div class="live-dot"></div> LIVE AUF TWITCH' : 'OFFLINE'}
                </span>
            </div>
        `;
        container.appendChild(a);
    });
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

    // --- NEU: Zeichne die schönen Verbindungslinien! ---
    // Wir nutzen ein Timeout, damit das DOM und Flexbox zuerst fertig layouten können
    setTimeout(drawBracketLines, 100); 
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
    div.className = 'match-card'; 
    div.id = `match-${m.id}`; 
    
    // Wichtig für unsere Linien-Logik!
    div.setAttribute('data-next-match', m.next_match_id || '');
    div.setAttribute('data-status', m.status);
    
    if (m.status === 'LIVE') div.classList.add('is-live');
    if (m.is_grand_final) div.classList.add('grand-final'); 

    const t1 = resolve(m.team_1, teams);
    const t2 = resolve(m.team_2, teams);

    const t1Winner = m.winner_id === m.team_1 && m.team_1 !== '[BYE]' && m.team_1 !== null;
    const t2Winner = m.winner_id === m.team_2 && m.team_2 !== '[BYE]' && m.team_2 !== null;
    
    const t1Loser = (!m.team_1 || m.team_1 === '[BYE]' || (m.winner_id && !t1Winner));
    const t2Loser = (!m.team_2 || m.team_2 === '[BYE]' || (m.winner_id && !t2Winner));

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

// --- NEU: Magische SVG Verbindungslinien ---
function drawBracketLines() {
    ['bracket-winners', 'bracket-losers'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if(!container || container.classList.contains('hidden')) return;

        // Erstelle eine SVG Leinwand, falls noch keine da ist
        let svg = container.querySelector('.bracket-lines-svg');
        if(!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'bracket-lines-svg');
            container.insertBefore(svg, container.firstChild);
        }
        
        // Leinwand muss genauso groß sein wie der Scroll-Bereich
        svg.style.width = Math.max(container.scrollWidth, container.clientWidth) + 'px';
        svg.style.height = Math.max(container.scrollHeight, container.clientHeight) + 'px';

        let paths = '';
        const containerRect = container.getBoundingClientRect();

        const cards = container.querySelectorAll('.match-card');
        cards.forEach(card => {
            const nextId = card.getAttribute('data-next-match');
            if (nextId) {
                const nextCard = document.getElementById(`match-${nextId}`);
                if (nextCard && container.contains(nextCard)) { 
                    const r1 = card.getBoundingClientRect();
                    const r2 = nextCard.getBoundingClientRect();

                    // Berechne Start (Rechts Mitte der Karte) und Ende (Links Mitte der nächsten Karte)
                    const startX = r1.right - containerRect.left + container.scrollLeft;
                    const startY = r1.top + (r1.height / 2) - containerRect.top + container.scrollTop;
                    
                    const endX = r2.left - containerRect.left + container.scrollLeft;
                    const endY = r2.top + (r2.height / 2) - containerRect.top + container.scrollTop;

                    // Für weiche Kurven berechnen wir den Mittelpunkt
                    const curveX = (startX + endX) / 2;
                    
                    // Linie leuchtet auf, wenn das Match bereits abgeschlossen ist!
                    const isFinished = card.getAttribute('data-status') === 'FINISHED';
                    const color = isFinished ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
                    const strokeWidth = isFinished ? '2' : '1';

                    // Zeichnet eine geschwungene Bezier-Kurve
                    paths += `<path d="M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
                }
            }
        });
        svg.innerHTML = paths;
    });
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
    // WICHTIG: Wenn schon ein Timer läuft (z.B. nach einem Geister-Update), löschen wir ihn erst!
    if (countdownInterval) clearInterval(countdownInterval);

    const target = new Date(iso).getTime();
    countdownInterval = setInterval(() => {
        const diff = target - new Date().getTime();
        if (diff < 0) return document.getElementById('countdown').innerText = "BEREIT";
        
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        document.getElementById('countdown').innerText = `${d}T ${h}H ${m}M ${s}S`;
    }, 1000);
}

function setupHoverEffects() {
    document.querySelectorAll('.bracket-scroll-wrapper').forEach(wrapper => {
        if (wrapper.dataset.hoverBound) return;
        wrapper.dataset.hoverBound = "true";

        wrapper.addEventListener('mouseover', (e) => {
            const row = e.target.closest('.team-row');
            if (!row) return;
            
            const teamId = row.getAttribute('data-team-id');
            if (!teamId || teamId === '[BYE]') return;

            wrapper.classList.add('is-hovering');
            
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
    const gf = bracket.find(m => m.is_grand_final);
    
    // Check: Ist das Finale vorbei UND gibt es einen Gewinner?
    if (gf && gf.status === 'FINISHED' && gf.winner_id) {
        
        // --- SMART CACHE CHECK ---
        // Wir bauen einen einzigartigen Key: z.B. "seen_UIC_EMBER"
        const storageKey = `uic_champion_seen_${gf.winner_id}`;
        const alreadySeen = localStorage.getItem(storageKey);

        // Wenn der User diesen Sieger schon gesehen hat, brechen wir hier ab!
        if (alreadySeen === 'true') {
            console.log("Champion screen already seen for:", gf.winner_id);
            return; 
        }

        // --- SCREEN AUFBAUEN ---
        const champ = resolve(gf.winner_id, teams);
        document.getElementById('champ-name').innerText = champ.name;
        
        if (champ.logo) {
            document.getElementById('champ-logo').src = champ.logo;
            document.getElementById('champ-logo').style.display = 'block';
        } else {
            document.getElementById('champ-logo').style.display = 'none';
        }

        const champScreen = document.getElementById('champion-screen');

        // 1. "hidden" entfernen
        champScreen.classList.remove('hidden');

        // 2. Animation starten (mit Timeout)
        setTimeout(() => {
            champScreen.classList.add('show-champion');
            
            // --- JETZT SPEICHERN WIR DEN STATUS ---
            // Damit beim nächsten Reload der Screen NICHT mehr kommt
            localStorage.setItem(storageKey, 'true');
            
        }, 50);

        // 3. Schließen Logik
        document.getElementById('close-champ').onclick = () => {
            champScreen.classList.remove('show-champion');
            setTimeout(() => {
                champScreen.classList.add('hidden');
            }, 800); // Warten bis CSS Animation (0.8s) durch ist
        };
    }
}
