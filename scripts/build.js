const fs = require('fs');
const path = require('path');

// Pfad-Konfiguration
const DATA_DIR = path.join(__dirname, '../data');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const OUTPUT_DIR = path.join(DATA_DIR, 'generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'db.json');

// Sicherstellen, dass der Output-Ordner existiert
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Alle Teams laden
console.log('🔄 Loading Teams...');
const teams = {};
const teamFiles = fs.readdirSync(TEAMS_DIR).filter(file => file.endsWith('.json'));

teamFiles.forEach(file => {
    const rawData = fs.readFileSync(path.join(TEAMS_DIR, file));
    const team = JSON.parse(rawData);
    teams[team.id] = team;
    console.log(`   - Loaded: ${team.name}`);
});

// 2. Turnier-Config laden
console.log('🔄 Loading Tournament Config...');
const tournamentRaw = fs.readFileSync(path.join(DATA_DIR, 'tournament.json'));
const tournament = JSON.parse(tournamentRaw);

// 3. Datenbank zusammenbauen
const database = {
    last_updated: new Date().toISOString(),
    meta: tournament.meta,
    bracket: tournament.bracket,
    teams: teams
};

// 4. Speichern
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(database, null, 2));
console.log(`✅ Build Complete! Database saved to ${OUTPUT_FILE}`);
