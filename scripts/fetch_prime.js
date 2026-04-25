const fs = require('fs');
const path = require('path');

// --- 1. CONFIGURATION ---
const DATA_FILE = 'prime_stats.json';
// WICHTIG: Pfad zeigt jetzt in den 'data' Ordner!
const OUTPUT_PATH = path.resolve(__dirname, '../data', DATA_FILE);

// Set this to the start of the current split
const SEASON_START = new Date('2026-04-01T00:00:00'); 

const TEAMS = {
    "RISING_DAWN": { id: "212208", manual_div: "Kalibrierung" },
    "ODE_ABSOLUT_ZERO":   { id: "209281", manual_div: "Division 5" },
    "UIC_EMBER":   { id: "211165", manual_div: "Division 6" }
};

const HEADERS = { 'User-Agent': 'UIC-Dashboard-Bot/2.2' };

async function getTeamIntel(teamKey, config) {
    console.log(`📡 Scanning: UIC ${teamKey.toUpperCase()}...`);
    try {
        const response = await fetch(`https://primebot.me/api/v1/teams/${config.id}/`, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const now = new Date();
        
        let mapWins = 0;
        let mapLosses = 0;
        let formHistory = []; 
        let nextMatch = null;
        let lastMatch = null;

        // NEW FIX: Extract the current roster directly from the top-level 'players' array
        let currentRoster = [];
        if (data.players && Array.isArray(data.players)) {
            currentRoster = data.players.map(p => ({
                summoner: p.summoner_name,
                is_captain: p.is_leader || false
            })).slice(0, 7); // Keeps your original 7-player limit
        }

        if (data.matches && Array.isArray(data.matches)) {
            // Sort Oldest -> Newest
            const sortedMatches = data.matches.sort((a, b) => new Date(a.begin) - new Date(b.begin));

            sortedMatches.forEach(m => {
                const matchDate = new Date(m.begin);

                // FILTER: Skip games before Season Start
                if (matchDate < SEASON_START) return;

                // B. SCORING (Best of 2)
                if (m.result && matchDate < now) {
                    const [scoreUs, scoreThem] = m.result.split(':').map(Number);
                    if (!isNaN(scoreUs)) {
                        mapWins += scoreUs;
                        mapLosses += scoreThem;
                        
                        if (scoreUs > scoreThem) formHistory.push('W');
                        else if (scoreUs === scoreThem) formHistory.push('D');
                        else formHistory.push('L');
                        
                        // Capture details of the very last played match
                        lastMatch = {
                            result: scoreUs > scoreThem ? "SIEG" : (scoreUs === scoreThem ? "UNENTSCHIEDEN" : "NIEDERLAGE"),
                            score: `${scoreUs} - ${scoreThem}`,
                            enemy: m.enemy_team ? m.enemy_team.team_tag : "OPP",
                            date: m.begin
                        };
                    }
                }

                // C. NEXT MATCH
                if (!nextMatch && matchDate > now) {
                    nextMatch = {
                        date: m.begin,
                        tag: m.enemy_team ? m.enemy_team.team_tag : "TBD",
                        link: m.prime_league_link // Ensure this exists in API response
                    };
                }
            });
        }

        const totalMaps = mapWins + mapLosses;

        return {
            id: config.id,
            key: teamKey,
            meta: { 
                name: data.name,
                div: data.division || config.manual_div 
            },
            stats: {
                wins: mapWins,
                losses: mapLosses,
                points: mapWins, 
                games: totalMaps,
                win_rate: totalMaps > 0 ? Math.round((mapWins / totalMaps) * 100) : 0,
                form: formHistory.slice(-5)
            },
            next_match: nextMatch,
            last_match: lastMatch,
            roster: currentRoster, // Updated to use the live roster extracted above
            team_link: data.prime_league_link,
            logo: data.logo_url
        };

    } catch (e) {
        console.error(`❌ Error [${teamKey}]:`, e.message);
        return null;
    }
}

async function start() {
    const database = {};
    for (const [key, config] of Object.entries(TEAMS)) {
        const stats = await getTeamIntel(key, config);
        if (stats) database[key] = stats;
        await new Promise(r => setTimeout(r, 250));
    }
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(database, null, 2));
    console.log(`\n✅ TELEMETRY UPDATED: ${OUTPUT_PATH}`);
}

start();
