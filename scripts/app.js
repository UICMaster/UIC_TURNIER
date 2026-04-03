const API_PATH = './data/generated/db.json';

let currentDbString = null; 
let countdownInterval = null;
let globalTeams = {};
let globalBracket = [];

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', debounce(drawBracketLines, 150));

// Utility: Prevents heavy functions from firing too often
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Utility: Sanitize strings to prevent Cross-Site Scripting (XSS)
function escapeHTML(str) {
    if (typeof str !== 'string') return str || '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function init() {
    await fetchAndRender();
    setInterval(fetchAndRender, 30000); // 30-Sekunden Geister-Update
}

async function fetchAndRender() {
    try {
        const res = await fetch(`${API_PATH}?t=${Date.now()}`);
        if (!res.ok) throw new Error("DB Error");
        
        const text = await res.text();
        if (currentDbString === text) return; 
        
        currentDbString = text;
        const db = JSON.parse(text);
        
        updateUI(db);
        
    } catch (e) {
        console.error("Geister-Update fehlgeschlagen:", e);
    }
}

function updateUI(db) {
    // Normalizes the status string to uppercase and protects against null values
    const s = (db.meta.status || '').toUpperCase(); 
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    if (s === 'UPCOMING') {
        document.getElementById('view-upcoming').classList.remove('hidden');
        setupTimer(db.meta.start_date_iso);
        document.getElementById('event-title').innerText = db.meta.title;
        document.getElementById('reg-link').href = db.meta.registration_link;
    } else if (s === 'LIVE' || s === 'FINISHED') {
        document.getElementById('view-live').classList.remove('hidden');
        document.getElementById('live-title').innerText = db.meta.title;
        
        globalTeams = db.teams;
        globalBracket = db.bracket;

        renderTeamStreams(db.teams);
        renderBracket(db.bracket, db.teams);
        setupHoverEffects();
        setupPanelEvents(); // Klick-Events für Side Panel
        checkChampion(db.bracket, db.teams);

    } else {
        document.getElementById('view-none').classList.remove('hidden');
    }
}

// --- NEW STREAM TRACKER LOGIC ---
let cachedStreamData = null;
let lastStreamCheckTime = 0;
const STREAM_CHECK_COOLDOWN = 3 * 60 * 1000; // 3 Minutes Cooldown

async function renderTeamStreams(teams) {
    const container = document.getElementById('team-streams-container');
    
    // Filter teams that actually have a Twitch link (and aren't BYE)
    const teamsArray = Object.values(teams).filter(t => t.id !== '[BYE]' && t.stream_link && t.stream_link.includes('twitch.tv'));
    if (teamsArray.length === 0) return;
    
    container.classList.remove('hidden');

    const now = Date.now();
    // Only ping DecAPI if we have no cache, or if 3 minutes have passed
    if (!cachedStreamData || (now - lastStreamCheckTime > STREAM_CHECK_COOLDOWN)) {
        
        // Show a loading state only on the very first load
        if (!cachedStreamData) {
            container.innerHTML = '<p class="text-muted" style="width:100%; text-align:center; font-family:var(--font-head); letter-spacing:2px;">SCANNING FREQUENCIES...</p>';
        }

        // Process all streams simultaneously
        cachedStreamData = await Promise.all(teamsArray.map(async (t) => {
            let isLiveDynamic = false;
            try {
                // Extract username from URL (e.g., https://twitch.tv/uic_gaming -> uic_gaming)
                const match = t.stream_link.match(/twitch\.tv\/([^/?]+)/);
                if (match && match[1]) {
                    const username = match[1];
                    const res = await fetch(`https://decapi.me/twitch/uptime/${username}`);
                    const text = await res.text();
                    
                    // DecAPI returns "[username] is offline" if offline.
                    isLiveDynamic = !text.includes('is offline') && !text.includes('Channel not found');
                }
            } catch (e) {
                console.warn(`Comms array failure for ${t.name}`);
            }
            return { ...t, is_live_dynamic: isLiveDynamic };
        }));
        
        lastStreamCheckTime = now;
    }

    // SORTING: Live streams first
    const liveTeams = cachedStreamData.filter(t => t.is_live_dynamic);
    const offlineTeams = cachedStreamData.filter(t => !t.is_live_dynamic);
    const sortedTeams = [...liveTeams, ...offlineTeams];

    // RENDER
    container.innerHTML = '';
    sortedTeams.forEach(t => {
        const a = document.createElement('a');
        a.className = 'stream-card';
        
        if (!t.is_live_dynamic) {
            a.style.opacity = '0.5';
            a.style.filter = 'grayscale(80%)';
        }
        
        a.href = t.stream_link;
        a.target = '_blank';
        
        a.innerHTML = `
            ${t.logo ? `<img src="${t.logo}" class="stream-avatar">` : `<div class="stream-avatar"></div>`}
            <div class="stream-info">
                <span class="stream-name">${escapeHTML(t.name)}</span>
                <span class="stream-status ${t.is_live_dynamic ? 'is-live' : ''}">
                    ${t.is_live_dynamic ? '<div class="live-dot"></div> LIVE AUF TWITCH' : 'OFFLINE'}
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
                <span class="t-name">${escapeHTML(t1.name)}</span>
            </div>
            <span class="t-score">${m.score_1}</span>
        </div>
        <div class="team-row ${t2Winner ? 'winner' : ''} ${t2Loser ? 'loser' : ''}" data-team-id="${m.team_2 || ''}">
             <div class="flex-center">
                ${t2.logo ? `<img src="${t2.logo}" class="t-logo">` : ''}
                <span class="t-name">${escapeHTML(t2.name)}</span>
            </div>
            <span class="t-score">${m.score_2}</span>
        </div>
    `;
    return div;
}

function drawBracketLines() {
    ['bracket-winners', 'bracket-losers'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if(!container || container.classList.contains('hidden')) return;

        let svg = container.querySelector('.bracket-lines-svg');
        if(!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'bracket-lines-svg');
            container.insertBefore(svg, container.firstChild);
        }
        
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

                    const startX = r1.right - containerRect.left + container.scrollLeft;
                    const startY = r1.top + (r1.height / 2) - containerRect.top + container.scrollTop;
                    
                    const endX = r2.left - containerRect.left + container.scrollLeft;
                    const endY = r2.top + (r2.height / 2) - containerRect.top + container.scrollTop;

                    const curveX = (startX + endX) / 2;
                    
                    const isFinished = card.getAttribute('data-status') === 'FINISHED';
                    const color = isFinished ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
                    const strokeWidth = isFinished ? '2' : '1';

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
    
    if (gf && gf.status === 'FINISHED' && gf.winner_id) {
        const storageKey = `uic_champion_seen_${gf.winner_id}`;
        const alreadySeen = localStorage.getItem(storageKey);

        if (alreadySeen === 'true') return; 

        const champ = resolve(gf.winner_id, teams);
        document.getElementById('champ-name').innerText = champ.name;
        
        if (champ.logo) {
            document.getElementById('champ-logo').src = champ.logo;
            document.getElementById('champ-logo').style.display = 'block';
        } else {
            document.getElementById('champ-logo').style.display = 'none';
        }

        const champScreen = document.getElementById('champion-screen');
        champScreen.classList.remove('hidden');

        setTimeout(() => {
            champScreen.classList.add('show-champion');
            localStorage.setItem(storageKey, 'true');
        }, 50);

        document.getElementById('close-champ').onclick = () => {
            champScreen.classList.remove('show-champion');
            setTimeout(() => {
                champScreen.classList.add('hidden');
            }, 800); 
        };
    }
}

// ============================================================================
// COMPACT ESPORTS MODAL LOGIK (Match & Team Profile)
// ============================================================================

function setupPanelEvents() {
    const overlay = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('close-modal');
    
    // Modal schließen bei Klick auf Hintergrund oder X
    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
    };
    closeBtn.onclick = closeModal;

    document.querySelectorAll('.bracket-scroll-wrapper').forEach(wrapper => {
        if (wrapper.dataset.clickBound) return;
        wrapper.dataset.clickBound = "true";

        wrapper.addEventListener('click', (e) => {
            const teamRow = e.target.closest('.team-row');
            if (teamRow) {
                e.stopPropagation(); 
                const teamId = teamRow.getAttribute('data-team-id');
                if (teamId && teamId !== '[BYE]') openTeamModal(teamId);
                return;
            }

            const matchCard = e.target.closest('.match-card');
            if (matchCard) {
                const matchId = matchCard.id.replace('match-', '');
                openMatchModal(matchId);
            }
        });
    });
}

function openTeamModal(teamId) {
    const team = globalTeams[teamId];
    if(!team) return;

    const content = document.getElementById('modal-content');
    
    // 1. ROSTER
    let rosterData = [];
    if (team.prime_intel && team.prime_intel.roster && team.prime_intel.roster.length > 0) {
        rosterData = team.prime_intel.roster;
    } else if (team.roster) {
        rosterData = team.roster;
    }

    let rosterHTML = '<p class="text-muted" style="font-size: 0.75rem;">// NO DATA</p>';
    if (rosterData.length > 0) {
        rosterHTML = '<div class="roster-list">' + rosterData.map(p => {
            const name = escapeHTML(p.summoner || p.name); 
            const role = escapeHTML(p.is_captain ? 'CAPTAIN' : (p.role || 'PLAYER'));
            const roleColor = p.is_captain ? 'var(--primary)' : 'var(--text-muted)';
            return `
            <div class="roster-row">
                <span class="r-name">${name}</span>
                <span class="r-role" style="color: ${roleColor};">${role}</span>
            </div>
        `}).join('') + '</div>';
    }

    // 2. PRIME LEAGUE STATS
    let statsHTML = '';
    let division = escapeHTML(team.acronym || 'UNKNOWN');
    
    if (team.prime_intel) {
        const intel = team.prime_intel;
        division = escapeHTML(intel.meta.div);
        
        const formBoxes = intel.stats.form.map(f => {
            let color = 'rgba(255,255,255,0.05)';
            let textColor = '#aaa';
            if (f === 'W') { color = 'rgba(0, 240, 255, 0.1)'; textColor = 'var(--primary)'; }
            if (f === 'L') { color = 'rgba(255, 0, 60, 0.1)'; textColor = '#ff003c'; }
            // Kleinere, präzisere Boxen für W/L
            return `<span style="display:inline-block; width:18px; height:18px; line-height:16px; text-align:center; background:${color}; color:${textColor}; font-size: 0.7rem; font-weight:normal; border:1px solid rgba(255,255,255,0.05); margin-right:3px;">${f}</span>`;
        }).join('');

        statsHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 2rem;">
                <div class="stat-box highlight">
                    <span class="hud-label">WIN RATE</span>
                    <div class="stat-value cyan">${intel.stats.win_rate}%</div>
                </div>
                <div class="stat-box">
                    <span class="hud-label">W/L MAPS</span>
                    <div class="stat-value">${intel.stats.wins} - ${intel.stats.losses}</div>
                </div>
            </div>
            
            ${intel.stats.form.length > 0 ? `
            <div style="margin-bottom: 2.5rem;">
                <span class="hud-label">FORM HISTORY</span>
                <div style="display: flex;">${formBoxes}</div>
            </div>
            ` : ''}
        `;
    }

    content.innerHTML = `
        <div class="modal-split">
            <div class="modal-left">
                <span class="hud-label" style="color: var(--primary);">${division}</span>
                <h2 class="modal-title">${escapeHTML(team.name)}</h2>
                ${team.logo ? `<img src="${team.logo}" style="width:100px; height:100px; object-fit:contain; opacity: 0.8; margin: 1rem 0; filter: drop-shadow(0 0 10px rgba(0,240,255,0.2));">` : ''}
                
                ${team.prime_intel && team.prime_intel.team_link ? `<a href="${team.prime_intel.team_link}" target="_blank" class="tactical-btn">DATABASE LINK</a>` : ''}
            </div>
            
            <div class="modal-right">
                ${statsHTML}
                
                <div>
                    <span class="hud-label">ACTIVE ROSTER</span>
                    ${rosterHTML}
                </div>
            </div>
        </div>
    `;
    
    showModal();
}

function showModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden'); 
    
    // NEU: Scrollen der Hauptseite blockieren!
    document.body.style.overflow = 'hidden';
    
    // Kleiner Delay, damit die CSS-Transition (Fade & Scale) feuert
    setTimeout(() => {
        overlay.classList.add('active');
    }, 10);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('active');
    
    // NEU: Scrollen der Hauptseite wieder freigeben!
    document.body.style.overflow = '';
    
    // Warten, bis die CSS-Transition fertig ist, bevor es aus dem DOM verschwindet
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 300);
}
