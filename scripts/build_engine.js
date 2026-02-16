const fs = require('fs');
const path = require('path');

// --- KONFIGURATION ---
const DATA_DIR = path.join(__dirname, '../data');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const OUTPUT_FILE = path.join(DATA_DIR, 'generated/db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'tournament.json');

/**
 * KLASSE: TOURNAMENT ENGINE
 * Das Herzstück: Berechnet die Mathematik des Brackets.
 */
class TournamentEngine {
    constructor(participants) {
        this.participants = participants;
        this.matches = [];
        this.powerOfTwo = 2;
        
        // 1. Größe berechnen
        while (this.powerOfTwo < participants.length) { this.powerOfTwo *= 2; }
        
        // 2. Seeding mit BYEs auffüllen
        this.seededList = [...participants];
        while (this.seededList.length < this.powerOfTwo) { this.seededList.push(null); }
    }

    generateDoubleElimination() {
        this.matches = []; // Reset
        const totalSlots = this.powerOfTwo;
        const wbRounds = Math.log2(totalSlots);
        
        // --- A. WINNERS BRACKET (WB) ---
        // Generiert Matches basierend auf binärem Baum
        let matchCount = totalSlots / 2;
        for (let r = 1; r <= wbRounds; r++) {
            for (let i = 0; i < matchCount; i++) {
                const isFinal = r === wbRounds;
                
                // Teams nur in Runde 1 setzen
                let t1 = (r === 1) ? this.seededList[i] : null;
                let t2 = (r === 1) ? this.seededList[totalSlots - 1 - i] : null;

                // ID Logik: wb_r1_m1
                const id = `wb_r${r}_m${i + 1}`;
                const nextId = isFinal ? 'gf_m1' : `wb_r${r+1}_m${Math.ceil((i + 1) / 2)}`;
                
                // Drop Target für Loser Bracket berechnen (Die komplexe Logik!)
                // Verlierer aus WB Runde R droppen in LB Runde: (R-1)*2 + 1
                // Ausnahme: WB Finale Verlierer geht ins LB Finale
                let loserId = null;
                if (!isFinal) {
                    const lbRound = (r - 1) * 2 + 1;
                    // In LB Runde 1 ist die Mapping Logik: Index i -> Match ceil((i+1)/2)
                    // In späteren Runden ist das Mapping komplexer, wir nutzen hier eine vereinfachte "Flow"-Logik
                    // für Standard 8/16/32 Brackets, die sauber rendert.
                    const lbMatchIndex = Math.ceil((i + 1) / 2); 
                    loserId = `lb_r${lbRound}_m${i + 1}`; // Simplifiziert: Droppt in gleichen Index Slot
                    // Korrektur für R1 Drop: Da LB R1 nur halb so viele Matches hat
                    if (r === 1) loserId = `lb_r1_m${Math.ceil((i + 1) / 2)}`;
                } else {
                    loserId = `lb_r${(wbRounds - 1) * 2}_m1`; // Verlierer WB Finale -> LB Finale
                }

                this.addMatch({
                    id, round: r, type: 'WINNER', 
                    next_match_id: nextId, loser_match_id: loserId,
                    team_1: t1, team_2: t2
                });
            }
            matchCount /= 2;
        }

        // --- B. LOSERS BRACKET (LB) ---
        // Logik: Hat (WB_Rounds - 1) * 2 Runden
        if (totalSlots >= 4) {
            const lbRounds = (wbRounds - 1) * 2;
            let lbMatchCount = totalSlots / 4; 

            for (let r = 1; r <= lbRounds; r++) {
                for (let i = 0; i < lbMatchCount; i++) {
                    const isLbFinal = r === lbRounds;
                    const nextId = isLbFinal ? 'gf_m1' : `lb_r${r+1}_m${Math.ceil((i + 1) / (r % 2 === 1 ? 1 : 2))}`;

                    this.addMatch({
                        id: `lb_r${r}_m${i + 1}`,
                        round: r, type: 'LOSER',
                        next_match_id: nextId,
                        team_1: null, team_2: null
                    });
                }
                // Anzahl matches halbiert sich nur jede gerade Runde (2, 4, 6...)
                if (r % 2 === 0) lbMatchCount /= 2;
            }
        }

        // --- C. GRAND FINAL ---
        this.addMatch({
            id: 'gf_m1',
            round: wbRounds + 1, type: 'WINNER',
            next_match_id: null,
            team_1: null, team_2: null,
            is_grand_final: true
        });

        return this.matches;
    }

    addMatch(data) {
        // Standardwerte setzen
        this.matches.push({
            score_1: 0, score_2: 0, 
            winner_id: null, status: 'WAITING',
            ...data
        });
    }

    // --- INTELLIGENZ: AUTO-UPDATE ---
    // Hier prüfen wir, ob Matches fertig sind und schieben Teams weiter
    processUpdates() {
        // Wir iterieren mehrfach, falls ein Freilos eine Kettenreaktion auslöst
        let changed = true;
        while(changed) {
            changed = false;
            
            // Map für schnellen Zugriff
            const matchMap = new Map(this.matches.map(m => [m.id, m]));

            this.matches.forEach(match => {
                // 1. Freilos-Check (BYE)
                if (match.status === 'WAITING' || match.status === 'SCHEDULED') {
                    if (match.team_1 && match.team_2 === null && match.round === 1 && match.type === 'WINNER') {
                        // T1 hat Freilos
                        this._setWinner(match, match.team_1, matchMap);
                        changed = true;
                    } else if (match.team_1 === null && match.team_2 && match.round === 1 && match.type === 'WINNER') {
                        // T2 hat Freilos
                        this._setWinner(match, match.team_2, matchMap);
                        changed = true;
                    }
                }

                // 2. Score Check (Wurde manuell ein Sieger gesetzt?)
                if ((match.score_1 > 0 || match.score_2 > 0) && !match.winner_id) {
                     // Automatische Gewinner-Ermittlung bei Score > 0
                     // (Einfache Logik: Wer mehr hat gewinnt. Bei 0:0 passiert nix)
                     if (match.score_1 > match.score_2 && match.team_1) {
                         this._setWinner(match, match.team_1, matchMap);
                         changed = true;
                     } else if (match.score_2 > match.score_1 && match.team_2) {
                         this._setWinner(match, match.team_2, matchMap);
                         changed = true;
                     }
                }
                
                // 3. Status setzen
                if (match.winner_id) match.status = 'FINISHED';
                else if (match.team_1 && match.team_2) match.status = 'LIVE'; // Bereit zum Spielen
            });
        }
    }

    _setWinner(match, winnerId, map) {
        if (match.winner_id === winnerId) return; // Nichts zu tun
        
        match.winner_id = winnerId;
        match.status = 'FINISHED';

        // Verlierer ermitteln
        const loserId = (winnerId === match.team_1) ? match.team_2 : match.team_1;

        // A. Gewinner weiterleiten
        if (match.next_match_id) {
            const nextMatch = map.get(match.next_match_id);
            if (nextMatch) {
                // Finde freien Slot
                if (!nextMatch.team_1) nextMatch.team_1 = winnerId;
                else if (!nextMatch.team_2) nextMatch.team_2 = winnerId;
            }
        }

        // B. Verlierer droppen (nur wenn Team existiert, kein BYE)
        if (match.loser_match_id && loserId) {
            const loserMatch = map.get(match.loser_match_id);
            if (loserMatch) {
                if (!loserMatch.team_1) loserMatch.team_1 = loserId;
                else if (!loserMatch.team_2) loserMatch.team_2 = loserId;
            }
        }
    }
}

// --- MAIN RUNTIME ---
console.log('🏁 UIC Engine v2.0 wird gestartet...');

// 1. Laden
const teams = {};
if (fs.existsSync(TEAMS_DIR)) {
    fs.readdirSync(TEAMS_DIR).forEach(file => {
        if (file.endsWith('.json')) {
            const t = JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, file)));
            teams[t.id] = t;
        }
    });
}
const config = JSON.parse(fs.readFileSync(CONFIG_FILE));

// 2. Engine initialisieren & Bracket bauen
const engine = new TournamentEngine(config.participants);
engine.generateDoubleElimination();

// 3. Bestehende Ergebnisse mergen (WICHTIG!)
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        const oldDb = JSON.parse(fs.readFileSync(OUTPUT_FILE));
        engine.matches.forEach(newMatch => {
            const oldMatch = oldDb.bracket.find(m => m.id === newMatch.id);
            if (oldMatch) {
                // Wir übernehmen nur relevante Daten: Scores und manuellen Gewinner
                // Die Teams (team_1/team_2) lassen wir von der Engine neu berechnen, 
                // damit der "Flow" stimmt!
                newMatch.score_1 = oldMatch.score_1;
                newMatch.score_2 = oldMatch.score_2;
                
                // Wenn manuell ein Winner gesetzt wurde, übernehmen
                if (oldMatch.winner_id && !newMatch.winner_id) {
                    newMatch.winner_id = oldMatch.winner_id;
                }
            }
        });
        console.log("✅ Alte Spielstände geladen.");
    } catch (e) {}
}

// 4. Engine rechnen lassen (Updates verarbeiten)
engine.processUpdates();

// 5. Speichern
const db = {
    updated_at: new Date().toISOString(),
    meta: config.meta,
    teams: teams,
    bracket: engine.matches
};

if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2));
console.log(`✅ Datenbank erfolgreich generiert.`);
