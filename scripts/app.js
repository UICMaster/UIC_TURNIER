const API_PATH = './data/generated/db.json';

let currentDbString = null; 
let countdownInterval = null;
let globalTeams = {};
let globalBracket = [];

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', drawBracketLines);

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

function renderTeamStreams(teams) {
    const container = document.getElementById('team-streams-container');
    container.innerHTML = '';
    
    const teamsArray = Object.values(teams).filter(t => t.id !== '[BYE]');
    if(teamsArray.length === 0) return;
    
    container.classList.remove('hidden');

    teamsArray.forEach(t => {
        const hasStream = !!t.stream_link;
        const isLive = t.is_live === true; 
        
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
            const name = p.summoner || p.name; 
            const role = p.is_captain ? 'CAPTAIN' : (p.role || 'PLAYER');
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
    let division = team.acronym || 'UNKNOWN';
    
    if (team.prime_intel) {
        const intel = team.prime_intel;
        division = intel.meta.div;
        
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
                <h2 class="modal-title">${team.name}</h2>
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

function openMatchModal(matchId) {
    const match = globalBracket.find(m => m.id === matchId);
    if(!match) return;

    const t1 = resolve(match.team_1, globalTeams);
    const t2 = resolve(match.team_2, globalTeams);
    const content = document.getElementById('modal-content');
    
    let detailsHTML = '<div class="stat-box" style="margin-top: 10px;"><span class="hud-label" style="margin:0;">// NO MAP DATA FOUND</span></div>';

    if (match.details && match.details.maps && match.details.maps.length > 0) {
        detailsHTML = '<div class="roster-list">' + match.details.maps.map(m => `
            <div class="roster-row">
                <span class="hud-label" style="margin:0; color:#fff;">${m.map_name}</span>
                <span style="font-family: var(--font-head); font-size: 1.1rem; color: var(--text-muted);">
                    <span style="${m.score_1 > m.score_2 ? 'color: var(--primary);' : ''}">${m.score_1}</span> 
                    <span style="margin: 0 4px; font-size: 0.9rem;">:</span> 
                    <span style="${m.score_2 > m.score_1 ? 'color: var(--primary);' : ''}">${m.score_2}</span>
                </span>
            </div>
        `).join('') + '</div>';
    }

    content.innerHTML = `
        <div class="modal-split">
            <div class="modal-left" style="align-items: flex-start;">
                <span class="hud-label">STATUS: ${match.status}</span>
                <h2 class="modal-title" style="font-size: 1.6rem; margin: 1rem 0;">${t1.name} <br><span style="color:var(--text-muted); font-size: 0.9rem;">VS</span><br> ${t2.name}</h2>
                
                <div class="stat-box highlight" style="width: 100%; margin: 1rem 0;">
                    <span class="hud-label">SERIES SCORE</span>
                    <div style="font-size: 2.5rem; font-family: var(--font-head); color: #fff; line-height: 1; margin-top: 5px;">
                        ${match.score_1} <span style="color: var(--primary); font-size: 2rem;">-</span> ${match.score_2}
                    </div>
                </div>

                ${match.details && match.details.vod_link ? `<a href="${match.details.vod_link}" target="_blank" class="tactical-btn">WATCH REPLAY</a>` : ''}
            </div>
            
            <div class="modal-right">
                <span class="hud-label">MAP BREAKDOWN</span>
                ${detailsHTML}
            </div>
        </div>
    `;
    
    showModal();
}

function showModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden'); 
    
    // Kleiner Delay, damit die CSS-Transition (Fade & Scale) feuert
    setTimeout(() => {
        overlay.classList.add('active');
    }, 10);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('active');
    
    // Warten, bis die CSS-Transition fertig ist, bevor es aus dem DOM verschwindet
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 300);
}
