const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const OUTPUT_FILE = path.join(DATA_DIR, 'generated/db.json');

// --- 1. TEAMS LADEN ---
function loadTeams() {
    const teams = {};
    if (fs.existsSync(TEAMS_DIR)) {
        fs.readdirSync(TEAMS_DIR).forEach(file => {
            if (file.endsWith('.json')) {
                const raw = fs.readFileSync(path.join(TEAMS_DIR, file));
                const team = JSON.parse(raw);
                teams[team.id] = team;
            }
        });
    }
    return teams;
}

// --- 2. BRACKET LOGIK (DEUTSCH) ---
function generateBracket(participantIds) {
    let bracket = [];
    
    // A. Auf 2er Potenz auffüllen (4, 8, 16, 32)
    let power = 2;
    while (power < participantIds.length) { power *= 2; }
    
    const totalSlots = power;
    const byesNeeded = totalSlots - participantIds.length;
    
    // B. Seed Liste erstellen (Teams + Freilose)
    let seededList = [...participantIds];
    for (let i = 0; i < byesNeeded; i++) seededList.push(null);

    // C. Winners Bracket Generieren
    const rounds = Math.log2(totalSlots);
    let matchCount = totalSlots / 2;

    for (let r = 1; r <= rounds; r++) {
        for (let i = 0; i < matchCount; i++) {
            // Nur in Runde 1 setzen wir Teams, danach sind es Platzhalter
            let t1 = (r === 1) ? seededList[i] : null;
            let t2 = (r === 1) ? seededList[totalSlots - 1 - i] : null;

            // Auto-Win Logik für Freilose
            let winner = null;
            let status = "SCHEDULED";
            
            if (r === 1) {
                if (t1 && !t2) { winner = t1; status = "FINISHED"; } // T1 hat Freilos
                if (!t1 && t2) { winner = t2; status = "FINISHED"; } // T2 hat Freilos
            } else {
                status = "WAITING";
            }

            bracket.push({
                id: `wb_r${r}_m${i + 1}`,
                round: r,
                type: "WINNER",
                next_match_id: (r === rounds) ? null : `wb_r${r + 1}_m${Math.ceil((i + 1) / 2)}`,
                team_1: t1,
                team_2: t2,
                score_1: 0,
                score_2: 0,
                winner_id: winner,
                status: status
            });
        }
        matchCount /= 2;
    }

    // D. Losers Bracket (Vereinfacht: Slots erstellen)
    // Wir erstellen Slots für das Loser Bracket, damit sie angezeigt werden.
    // Die exakte Drop-Logik (wer fällt wohin) ist komplex, hier werden die Slots bereitgestellt.
    let loserMatchCount = totalSlots / 4; // Startet kleiner
    const loserRounds = rounds - 1; 
    
    if (loserRounds > 0) {
         for (let r = 1; r <= loserRounds; r++) {
            for (let i = 0; i < loserMatchCount; i++) {
                bracket.push({
                    id: `lb_r${r}_m${i + 1}`,
                    round: r,
                    type: "LOSER",
                    next_match_id: `lb_r${r+1}_m...`, // Logik vereinfacht
                    team_1: null,
                    team_2: null,
                    score_1: 0,
                    score_2: 0,
                    winner_id: null,
                    status: "WAITING"
                });
            }
            // Loser Bracket schrumpft langsamer in echten Systemen, 
            // hier vereinfacht halbiert für Anzeige
            if (loserMatchCount > 1) loserMatchCount /= 2; 
         }
    }

    return bracket;
}

// --- MAIN ---
console.log('🇩🇪 Starte Build Prozess...');
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

const teams = loadTeams();
const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tournament.json')));
const autoBracket = generateBracket(config.participants);

// --- MERGE (Alte Ergebnisse behalten!) ---
let finalBracket = autoBracket;
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        const oldDb = JSON.parse(fs.readFileSync(OUTPUT_FILE));
        finalBracket = autoBracket.map(newMatch => {
            const oldMatch = oldDb.bracket.find(m => m.id === newMatch.id);
            // Wenn Match existiert und Status nicht "WAITING" ist -> Daten behalten
            if (oldMatch && oldMatch.status !== "WAITING" && oldMatch.status !== "SCHEDULED") {
                return { ...newMatch, ...oldMatch }; // Überschreibe das neue mit dem alten Status
            }
            return newMatch;
        });
        console.log("✅ Bestehende Ergebnisse wiederhergestellt.");
    } catch (e) { console.log("⚠️ Neue Datenbank wird erstellt."); }
}

const db = {
    updated_at: new Date().toISOString(),
    meta: config.meta,
    teams: teams,
    bracket: finalBracket
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2));
console.log(`✅ Datenbank bereit: ${OUTPUT_FILE}`);
