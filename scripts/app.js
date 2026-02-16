function renderBracket(matches, teams) {
    const container = document.querySelector('.bracket-grid'); // Oder wo dein Grid ist
    if(!container) return;
    
    // Leeren um Duplikate zu vermeiden
    // container.innerHTML = ''; // Vorsicht: Wenn du statisches HTML hast, das hier weglassen

    matches.forEach(match => {
        // Wir rendern vorerst nur Winners Bracket Matches
        if (match.bracket_type !== 'WINNER') return; 

        // Suche das HTML Element (muss existieren oder dynamisch erstellt werden)
        let matchEl = document.getElementById(`match-${match.id}`);
        
        // Wenn du das HTML dynamisch generieren willst (empfohlen bei Auto-Bracket):
        if (!matchEl) {
            matchEl = document.createElement('div');
            matchEl.id = `match-${match.id}`;
            matchEl.className = 'match-card card card--hud';
            // Füge es in die richtige Spalte ein (Logik nötig für Spalten)
            // Fürs erste nehmen wir an, die Elemente existieren oder wir appenden sie einfach
            // container.appendChild(matchEl); 
            // ^ Das ist komplex, da wir Spalten brauchen. 
            // Bleiben wir dabei: Das JS befüllt existierende IDs.
        }

        if (matchEl) {
            // Team Namen auflösen
            // Wenn match.team_1 ein String ist (ID), holen wir das Objekt. Wenn null, ist es ein Bye.
            const t1Name = match.team_1 ? (teams[match.team_1]?.acronym || teams[match.team_1]?.name) : 'BYE';
            const t2Name = match.team_2 ? (teams[match.team_2]?.acronym || teams[match.team_2]?.name) : 'BYE';
            
            const t1Score = match.score_1 ?? 0;
            const t2Score = match.score_2 ?? 0;

            matchEl.innerHTML = `
                <div class="team-row ${match.winner_id === match.team_1 && match.team_1 ? 'winner' : ''}">
                    <span class="t-name">${t1Name}</span> <span class="t-score">${t1Score}</span>
                </div>
                <div class="team-row ${match.winner_id === match.team_2 && match.team_2 ? 'winner' : ''}">
                    <span class="t-name">${t2Name}</span> <span class="t-score">${t2Score}</span>
                </div>
            `;
            
            // Visuelles Feedback für Status
            if(match.status === 'LIVE') matchEl.classList.add('is-live');
            else matchEl.classList.remove('is-live');
        }
    });
}
