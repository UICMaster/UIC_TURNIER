const fs = require('fs');
const path = require('path');

// --- KONFIGURATION ---
const DATA_DIR = path.join(__dirname, '../data');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const OUTPUT_DIR = path.join(DATA_DIR, 'generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'db.json');

// --- HELPER FUNKTIONEN ---

// 1. Teams laden
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

// 2. Bracket Generator (Der "Brain")
function generateDoubleElimination(participantIds) {
    let bracket = [];
    
    // A. Auf nächste 2er Potenz auffüllen (4, 8, 16, 32)
    let power = 2;
    while (power < participantIds.length) { power *= 2; }
    
    const totalSlots = power;
    const byesNeeded = totalSlots - participantIds.length;
    
    // B. Teilnehmerliste mit "BYE" auffüllen
    // (Einfache Logik: Wir füllen erst Teams, dann Byes)
    let seededList = [...participantIds];
    for (let i = 0; i < byesNeeded; i++) {
        seededList.push(null); // null = BYE / Freilos
    }

    // C. Winners Bracket Generieren (Binary Tree)
    // Runde 1
    const wbRound1Matches = totalSlots / 2;
    for (let i = 0; i < wbRound1Matches; i++) {
        const teamA = seededList[i];
        const teamB = seededList[totalSlots - 1 - i]; // Snake Seeding (Erster gegen Letzten)
        
        // Automatische Winner-Ermittlung bei BYE
        let winner = null;
        let status = "SCHEDULED";
        
        if (teamA && !teamB) { winner = teamA; status = "FINISHED"; } // A hat Freilos
        if (!teamA && teamB) { winner = teamB; status = "FINISHED"; } // B hat Freilos

        bracket.push({
            id: `wb_r1_m${i + 1}`,
            round: 1,
            bracket_type: "WINNER",
            next_match_id: `wb_r2_m${Math.ceil((i + 1) / 2)}`,
            loser_to_match_id: `lb_r1_m${Math.floor(i / 2) + 1}`, // Verlierer droppt ins Loser Bracket
            team_1: teamA,
            team_2: teamB,
            score_1: 0,
            score_2: 0,
            winner_id: winner,
            status: status
        });
    }

    // Weitere Winners Runden (Platzhalter erstellen)
    let currentMatches = wbRound1Matches;
    let round = 2;
    while (currentMatches > 1) {
        currentMatches = currentMatches / 2;
        for (let i = 0; i < currentMatches; i++) {
            bracket.push({
                id: `wb_r${round}_m${i + 1}`,
                round: round,
                bracket_type: "WINNER",
                next_match_id: currentMatches === 1 ? "grand_final" : `wb_r${round + 1}_m${Math.ceil((i + 1) / 2)}`,
                loser_to_match_id: `lb_r${round}_m${i + 1}`, // Simplifiziertes Drop-Schema
                team_1: null, // Wird später gefüllt
                team_2: null,
                score_1: 0,
                score_2: 0,
                winner_id: null,
                status: "WAITING"
            });
        }
        round++;
    }

    // D. Losers Bracket (Basis-Struktur)
    // Hinweis: Ein perfektes Loser Bracket automatisch zu generieren ist sehr komplex.
    // Wir erstellen hier die Slots für Runde 1 im Loser Bracket.
    const lbRound1Matches = wbRound1Matches / 2;
    for (let i = 0; i < lbRound1Matches; i++) {
        bracket.push({
            id: `lb_r1_m${i + 1}`,
            round: 1,
            bracket_type: "LOSER",
            next_match_id: `lb_r2_m${Math.ceil((i + 1) / 2)}`,
            team_1: null, // Kommt vom Verlierer WB
            team_2: null,
            score_1: 0,
            score_2: 0,
            winner_id: null,
            status: "WAITING"
        });
    }

    return bracket;
}

// --- MAIN PROCESS ---

console.log('🔄 Starting Build Process...');

// 1. Setup
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 2. Load Data
const teams = loadTeams();
const tournamentConfig = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tournament.json')));

// 3. Generate Bracket
console.log(`📊 Generating Bracket for ${tournamentConfig.participants.length} Teams...`);
const autoBracket = generateDoubleElimination(tournamentConfig.participants);

// 4. Merge Logic (WICHTIG!)
// Wir dürfen existierende Ergebnisse (Scores) nicht überschreiben, wenn wir neu bauen!
// Wir laden die alte DB (falls existent) und behalten Scores.
let finalBracket = autoBracket;

if (fs.existsSync(OUTPUT_FILE)) {
    try {
        const oldDb = JSON.parse(fs.readFileSync(OUTPUT_FILE));
        // Wir mappen die Scores der alten Matches auf die neuen
        finalBracket = autoBracket.map(newMatch => {
            const oldMatch = oldDb.bracket.find(m => m.id === newMatch.id);
            if (oldMatch && oldMatch.status !== "WAITING" && oldMatch.status !== "SCHEDULED") {
                // Übernehme Ergebnisse aus der alten DB
                return {
                    ...newMatch,
                    score_1: oldMatch.score_1,
                    score_2: oldMatch.score_2,
                    winner_id: oldMatch.winner_id,
                    status: oldMatch.status
                };
            }
            return newMatch;
        });
        console.log("✅ Restored match results from previous build.");
    } catch (e) {
        console.warn("⚠️ Could not restore old data, starting fresh.");
    }
}

// 5. Final DB Object
const db = {
    updated_at: new Date().toISOString(),
    meta: tournamentConfig.meta,
    teams: teams,
    bracket: finalBracket
};

// 6. Save
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2));
console.log(`✅ Database generated at ${OUTPUT_FILE}`);
