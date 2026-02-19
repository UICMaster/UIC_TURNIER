const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const OUTPUT_FILE = path.join(DATA_DIR, 'generated/db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'tournament.json');

class TournamentEngine {
    constructor(participants) {
        this.matches = [];
        let size = 2;
        while (size < participants.length) size *= 2;
        this.seeded = [...participants];
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
                
                // Deterministic Slots (Verhindert Überschreiben)
                const nextSlot = (i % 2 === 0) ? 1 : 2;
                
                let loserId = null;
                if (r === 1) loserId = `lb_r1_m${Math.ceil((i+1)/2)}`;
                else if (!isFinal) loserId = `lb_r${(r-1)*2}_m${i+1}`; 
                else loserId = `lb_r${(wbRounds-1)*2}_m1`;
                
                const t1 = (r === 1) ? this.seeded[i] : null;
                const t2 = (r === 1) ? this.seeded[this.totalSlots - 1 - i] : null;

                this.addMatch({
                    id: `wb_r${r}_m${i+1}`, round: r, type: 'WINNER',
                    next_match_id: nextId, next_slot: nextSlot, 
                    loser_match_id: loserId, loser_slot: nextSlot,
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
                if (m.winner_id) return; // Überspringt bereits fertige Matches

                // A. BYE Logic (Freilose)
                if (m.status === 'WAITING' || m.status === 'SCHEDULED') {
                    if (m.team_1 && m.team_1 !== '[BYE]' && m.team_2 === '[BYE]') { 
                        this._win(m, m.team_1, map); changed = true; return;
                    }
                    if (m.team_1 === '[BYE]' && m.team_2 && m.team_2 !== '[BYE]') { 
                        this._win(m, m.team_2, map); changed = true; return;
                    }
                    if (m.team_1 === '[BYE]' && m.team_2 === '[BYE]') { 
                        this._win(m, '[BYE]', map); changed = true; return;
                    }
                }
                
                // B. Score Updates
                if (m.score_1 > 0 || m.score_2 > 0) {
                    if (m.score_1 > m.score_2 && m.team_1) { this._win(m, m.team_1, map); changed = true; }
                    else if (m.score_2 > m.score_1 && m.team_2) { this._win(m, m.team_2, map); changed = true; }
                }
            });

            // C. Status Updates
            this.matches.forEach(m => {
                if (m.winner_id) m.status = 'FINISHED';
                else if (m.team_1 && m.team_1 !== '[BYE]' && m.team_2 && m.team_2 !== '[BYE]') m.status = 'LIVE';
            });
        }
    }

    _win(match, winnerId, map) {
        match.winner_id = winnerId;
        
        // Winner Move (Jetzt deterministisch!)
        if (match.next_match_id) {
            const next = map.get(match.next_match_id);
            if (next) {
                if (match.next_slot === 1) next.team_1 = winnerId;
                else next.team_2 = winnerId;
            }
        }
        
        // Loser Drop (Jetzt deterministisch!)
        const loserId = (winnerId === match.team_1) ? match.team_2 : match.team_1;
        if (match.loser_match_id && loserId) {
            const loser = map.get(match.loser_match_id);
            if (loser) {
                if (match.loser_slot === 1) loser.team_1 = loserId;
                else if (match.loser_slot === 2) loser.team_2 = loserId;
                else !loser.team_1 ? loser.team_1 = loserId : loser.team_2 = loserId; // Fallback
            }
        }
    }
}

console.log("⚙️  Building Bracket...");

if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
const config = JSON.parse(fs.readFileSync(CONFIG_FILE));
const teams = {};
if (fs.existsSync(TEAMS_DIR)) {
    fs.readdirSync(TEAMS_DIR).forEach(f => {
        if(f.endsWith('.json')) teams[JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, f))).id] = JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, f)));
    });
}

const engine = new TournamentEngine(config.participants);
engine.generate();

// SCORE MERGE (Strikte Zahlen-Konvertierung, um Text-Fehler zu vermeiden)
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        const old = JSON.parse(fs.readFileSync(OUTPUT_FILE)).bracket;
        engine.matches.forEach(m => {
            const o = old.find(x => x.id === m.id);
            if (o) { 
                m.score_1 = Number(o.score_1) || 0; 
                m.score_2 = Number(o.score_2) || 0; 
            }
        });
    } catch(e) {}
}

engine.processUpdates();
fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    updated_at: new Date().toISOString(),
    meta: config.meta,
    teams: teams,
    bracket: engine.matches
}, null, 2));

console.log("✅ Database Updated.");