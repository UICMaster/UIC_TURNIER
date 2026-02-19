const fs = require('fs');
const path = require('path');

// KONFIGURATION
const DATA_DIR = path.join(__dirname, '../data');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const OUTPUT_FILE = path.join(DATA_DIR, 'generated/db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'tournament.json');

// --- ENGINE CLASS ---
class TournamentEngine {
    constructor(participants) {
        this.matches = [];
        let size = 2;
        while (size < participants.length) size *= 2;
        this.seeded = [...participants];
        // FIX 1: Explizites [BYE] statt null
        while (this.seeded.length < size) this.seeded.push('[BYE]'); 
        this.totalSlots = size;
    }

    generate() {
        this.matches = [];
        const wbRounds = Math.log2(this.totalSlots);

        // 1. WINNERS BRACKET
        let count = this.totalSlots / 2;
        for (let r = 1; r <= wbRounds; r++) {
            for (let i = 0; i < count; i++) {
                const isFinal = r === wbRounds;
                const nextId = isFinal ? 'gf_m1' : `wb_r${r+1}_m${Math.ceil((i+1)/2)}`;
                
                // FIX 2: Korrigierte Loser-Drop-Mathematik für perfekte Double Elimination
                let loserId = null;
                if (r === 1) {
                    loserId = `lb_r1_m${Math.ceil((i+1)/2)}`;
                } else if (!isFinal) {
                    loserId = `lb_r${(r-1)*2}_m${i+1}`; 
                } else {
                    loserId = `lb_r${(wbRounds-1)*2}_m1`;
                }
                
                const t1 = (r === 1) ? this.seeded[i] : null;
                const t2 = (r === 1) ? this.seeded[this.totalSlots - 1 - i] : null;

                this.addMatch({
                    id: `wb_r${r}_m${i+1}`, round: r, type: 'WINNER',
                    next_match_id: nextId, loser_match_id: loserId,
                    team_1: t1, team_2: t2
                });
            }
            count /= 2;
        }

        // 2. LOSERS BRACKET
        if (this.totalSlots >= 4) {
            const lbRounds = (wbRounds - 1) * 2;
            let lbCount = this.totalSlots / 4;
            for (let r = 1; r <= lbRounds; r++) {
                for (let i = 0; i < lbCount; i++) {
                    const isFinal = r === lbRounds;
                    const nextId = isFinal ? 'gf_m1' : `lb_r${r+1}_m${Math.ceil((i+1)/(r%2===1?1:2))}`;
                    this.addMatch({
                        id: `lb_r${r}_m${i+1}`, round: r, type: 'LOSER',
                        next_match_id: nextId, team_1: null, team_2: null
                    });
                }
                if (r % 2 === 0) lbCount /= 2;
            }
        }

        // 3. GRAND FINAL
        this.addMatch({
            id: 'gf_m1', round: wbRounds + 1, type: 'WINNER',
            next_match_id: null, team_1: null, team_2: null, is_grand_final: true
        });
    }

    addMatch(data) {
        this.matches.push({ score_1: 0, score_2: 0, winner_id: null, status: 'WAITING', ...data });
    }

    processUpdates() {
        let changed = true;
        while(changed) {
            changed = false;
            const map = new Map(this.matches.map(m => [m.id, m]));
            
            this.matches.forEach(m => {
                // FIX 3: BYEs (Freilose) werden wie unsichtbare "Geister" behandelt, 
                // die durchs Bracket fließen und sofort verlieren
                if (m.status === 'WAITING' || m.status === 'SCHEDULED') {
                    if (m.team_1 && m.team_1 !== '[BYE]' && m.team_2 === '[BYE]') { 
                        this._win(m, m.team_1, map); changed = true; 
                    }
                    else if (m.team_1 === '[BYE]' && m.team_2 && m.team_2 !== '[BYE]') { 
                        this._win(m, m.team_2, map); changed = true; 
                    }
                    else if (m.team_1 === '[BYE]' && m.team_2 === '[BYE]') { 
                        this._win(m, '[BYE]', map); changed = true; 
                    }
                }
                // B. Score Updates
                if ((m.score_1 > 0 || m.score_2 > 0) && !m.winner_id) {
                    if (m.score_1 > m.score_2 && m.team_1) { this._win(m, m.team_1, map); changed = true; }
                    else if (m.score_2 > m.score_1 && m.team_2) { this._win(m, m.team_2, map); changed = true; }
                }
                // C. Status
                if (m.winner_id) m.status = 'FINISHED';
                else if (m.team_1 && m.team_1 !== '[BYE]' && m.team_2 && m.team_2 !== '[BYE]') m.status = 'LIVE';
            });
        }
    }

    _win(match, winnerId, map) {
        if (match.winner_id) return;
        match.winner_id = winnerId;
        
        // Winner Move
        if (match.next_match_id) {
            const next = map.get(match.next_match_id);
            if (next) !next.team_1 ? next.team_1 = winnerId : next.team_2 = winnerId;
        }
        // Loser Drop
        const loserId = (winnerId === match.team_1) ? match.team_2 : match.team_1;
        if (match.loser_match_id && loserId) {
            const loser = map.get(match.loser_match_id);
            if (loser) !loser.team_1 ? loser.team_1 = loserId : loser.team_2 = loserId;
        }
    }
}

// --- EXECUTION ---
console.log("⚙️  Building Bracket...");

// 1. Load Config & Teams
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
const config = JSON.parse(fs.readFileSync(CONFIG_FILE));
const teams = {};
if (fs.existsSync(TEAMS_DIR)) {
    fs.readdirSync(TEAMS_DIR).forEach(f => {
        if(f.endsWith('.json')) teams[JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, f))).id] = JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, f)));
    });
}

// 2. Generate
const engine = new TournamentEngine(config.participants);
engine.generate();

// 3. Merge Old Scores (DER WICHTIGE FIX!)
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        const old = JSON.parse(fs.readFileSync(OUTPUT_FILE)).bracket;
        engine.matches.forEach(m => {
            const o = old.find(x => x.id === m.id);
            if (o) { 
                // Wir übernehmen NUR noch die Scores. Den winner_id muss die Engine 
                // jedes Mal selbst neu berechnen, damit das Vorrücken funktioniert!
                m.score_1 = o.score_1; 
                m.score_2 = o.score_2; 
            }
        });
    } catch(e) {}
}

// 4. Calculate & Save
engine.processUpdates();
fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    updated_at: new Date().toISOString(),
    meta: config.meta,
    teams: teams,
    bracket: engine.matches
}, null, 2));

console.log("✅ Database Updated.");