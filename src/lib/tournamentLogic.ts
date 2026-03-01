// Re-export types explicitly if needed, but standard interface export should work in TS.
// However, ensuring they are treated as types.
export type { Team, Match, Tournament };

interface Team {
    id: string;
    name: string;
    logoUrl?: string;
}

interface Match {
    id: string;
    round: number;
    team1: Team | null;
    team2: Team | null;
    score1: number | null;
    score2: number | null;
    startTime: string | null; // ISO string
    winnerId: string | null;
    // Coarse stage classification used for filtering in the UI
    // 'group' for group stage matches, 'playoff' for playoff bracket matches
    stage: 'group' | 'playoff';
    format?: string;
    name?: string; // Human-readable match title, e.g. 'Semi-Final 1', 'Grand Final'
    nextMatchId?: string | null;
    loserMatchId?: string | null;
    group?: string; // For group stage labeling: 'A', 'B', 'C', 'D'
}

interface BracketConfig {
    format: 'Single Elimination' | 'Double Elimination';
    hasGroupStage: boolean;
    groupStageFormat: 'Bo1' | 'Bo2' | 'Bo3';
    upperBracketFormat: 'Bo3' | 'Bo5';
    lowerBracketFormat: 'Bo1' | 'Bo3' | 'Bo5';
    grandFinalFormat: 'Bo5' | 'Bo7';
}

interface Tournament {
    id: string;
    organizerId?: string;
    name: string;
    description?: string;
    imageUrl?: string;
    teams: Team[];
    matches: Match[];
    status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'ongoing' | 'completed';
    bracketConfig?: BracketConfig;
}

export const shuffleTeams = (teams: { name: string; logoUrl?: string }[]): Team[] => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    return shuffled.map((t, index) => ({
        id: `team-${index + 1}`,
        name: t.name,
        logoUrl: t.logoUrl || '',
    }));
};

// Generate matches based on advanced bracket configuration
export const generateTournamentBracket = (teams: Team[], config: BracketConfig): Match[] => {
    const matches: Match[] = [];
    let matchIdCounter = 1;

    const generateId = () => `match-${matchIdCounter++}`;

    const totalTeams = teams.length;

    // Generate full double elimination bracket with upper and lower brackets
    const generateDoubleEliminationBracket = (slots: number): Match[] => {
        const allMatches: Match[] = [];
        const upperBracket: Match[][] = [];
        const lowerBracket: Match[][] = [];
        const totalRounds = Math.log2(slots);

        // Build upper bracket (winners bracket)
        for (let r = 0; r < totalRounds; r++) {
            upperBracket.push([]);
            const matchesInRound = slots / Math.pow(2, r + 1);
            for (let m = 0; m < matchesInRound; m++) {
                // Name: last round = 'UB Final', 1 match = 'UB Semi-Final', else 'UB R{n} Match {m}'
                let matchName = `Upper Bracket R${r + 1} Match ${m + 1}`;
                if (r === totalRounds - 1) matchName = 'Upper Bracket Final';
                else if (matchesInRound === 2) matchName = `Upper Bracket Semi-Final ${m + 1}`;
                else if (matchesInRound === 1) matchName = 'Upper Bracket Final';

                upperBracket[r].push({
                    id: generateId(),
                    round: r + 1,
                    stage: 'playoff',
                    format: config.upperBracketFormat || 'Bo3',
                    name: matchName,
                    team1: null,
                    team2: null,
                    score1: 0,
                    score2: 0,
                    startTime: null,
                    winnerId: null,
                    nextMatchId: null,
                    loserMatchId: null,
                });
            }
        }

        // Wire upper bracket: winners advance
        for (let r = 0; r < totalRounds - 1; r++) {
            for (let m = 0; m < upperBracket[r].length; m++) {
                const nextRoundMatchIndex = Math.floor(m / 2);
                upperBracket[r][m].nextMatchId = upperBracket[r + 1][nextRoundMatchIndex].id;
            }
        }

        // Build lower bracket (losers bracket)
        // Lower bracket has a more complex structure:
        // - Round 1: Losers from upper R1 play each other (N/4 matches)
        // - Round 2+: Mix of losers from upper bracket + winners from lower bracket

        // Lower bracket round 1: losers from upper bracket round 1
        const lowerR1Matches = slots / 4;
        lowerBracket.push([]);
        for (let m = 0; m < lowerR1Matches; m++) {
            lowerBracket[0].push({
                id: generateId(),
                round: 1,
                stage: 'playoff',
                format: config.lowerBracketFormat || 'Bo1',
                name: lowerR1Matches === 1 ? 'Elimination Match' : `Elimination Match ${m + 1}`,
                team1: null,
                team2: null,
                score1: 0,
                score2: 0,
                startTime: null,
                winnerId: null,
                nextMatchId: null,
                loserMatchId: null,
            });
        }

        // Wire upper bracket R1 losers to lower bracket R1
        for (let m = 0; m < upperBracket[0].length; m++) {
            const lowerMatchIndex = Math.floor(m / 2);
            upperBracket[0][m].loserMatchId = lowerBracket[0][lowerMatchIndex].id;
        }

        // Lower bracket subsequent rounds
        // Correct double-elimination pattern: for each upper round after R1,
        // create a "dropout" round (UB losers drop in to play LB winners)
        // and, if needed, a "consolidation" round (LB survivors play each other).
        let lowerRound = 1;
        for (let upperRound = 1; upperRound < totalRounds; upperRound++) {
            const droppedCount = upperBracket[upperRound].length;
            const prevLBRound = lowerBracket[lowerRound - 1];

            // --- Dropout round: UB losers enter and play LB winners ---
            const isLBFinal = droppedCount === 1 && upperRound === totalRounds - 1;
            lowerBracket.push([]);
            for (let m = 0; m < droppedCount; m++) {
                lowerBracket[lowerRound].push({
                    id: generateId(),
                    round: lowerRound + 1,
                    stage: 'playoff',
                    format: config.lowerBracketFormat || 'Bo1',
                    name: isLBFinal
                        ? 'Lower Bracket Final'
                        : `Lower Bracket R${lowerRound + 1} Match ${m + 1}`,
                    team1: null,
                    team2: null,
                    score1: 0,
                    score2: 0,
                    startTime: null,
                    winnerId: null,
                    nextMatchId: null,
                    loserMatchId: null,
                });
            }

            // Wire UB losers → dropout round
            for (let m = 0; m < droppedCount; m++) {
                upperBracket[upperRound][m].loserMatchId = lowerBracket[lowerRound][m].id;
            }

            // Wire previous LB round winners → dropout round (1:1 mapping)
            for (let m = 0; m < prevLBRound.length; m++) {
                if (m < lowerBracket[lowerRound].length) {
                    prevLBRound[m].nextMatchId = lowerBracket[lowerRound][m].id;
                }
            }

            lowerRound++;

            // --- Consolidation round (only when dropout had 2+ matches) ---
            if (droppedCount >= 2) {
                const consolidationSize = Math.floor(droppedCount / 2);
                const dropoutRound = lowerBracket[lowerRound - 1];

                lowerBracket.push([]);
                for (let m = 0; m < consolidationSize; m++) {
                    lowerBracket[lowerRound].push({
                        id: generateId(),
                        round: lowerRound + 1,
                        stage: 'playoff',
                        format: config.lowerBracketFormat || 'Bo1',
                        name: consolidationSize === 1
                            ? `Lower Bracket R${lowerRound + 1}`
                            : `Lower Bracket R${lowerRound + 1} Match ${m + 1}`,
                        team1: null,
                        team2: null,
                        score1: 0,
                        score2: 0,
                        startTime: null,
                        winnerId: null,
                        nextMatchId: null,
                        loserMatchId: null,
                    });
                }

                // Wire dropout round winners → consolidation (2:1 mapping)
                for (let m = 0; m < dropoutRound.length; m++) {
                    const nextMatchIndex = Math.floor(m / 2);
                    if (nextMatchIndex < lowerBracket[lowerRound].length) {
                        dropoutRound[m].nextMatchId = lowerBracket[lowerRound][nextMatchIndex].id;
                    }
                }

                lowerRound++;
            }
        }

        // Grand Finals: Upper bracket winner vs Lower bracket winner
        const grandFinal: Match = {
            id: generateId(),
            round: totalRounds + 1,
            stage: 'playoff',
            format: config.grandFinalFormat || 'Bo5',
            name: 'Grand Final',
            team1: null,
            team2: null,
            score1: 0,
            score2: 0,
            startTime: null,
            winnerId: null,
            nextMatchId: null,
            loserMatchId: null,
        };

        // Wire upper bracket final winner to grand final
        const upperFinal = upperBracket[totalRounds - 1][0];
        upperFinal.nextMatchId = grandFinal.id;

        // Wire lower bracket final winner to grand final
        const lowerFinal = lowerBracket[lowerBracket.length - 1][0];
        lowerFinal.nextMatchId = grandFinal.id;

        // Collect all matches
        upperBracket.forEach(roundMatches => allMatches.push(...roundMatches));
        lowerBracket.forEach(roundMatches => allMatches.push(...roundMatches));
        allMatches.push(grandFinal);

        return allMatches;
    };

    // Helper: generate a simple single-elimination playoff bracket of size `slots`
    const generatePlayoffBracket = (slots: number, isDoubleElim: boolean = false): Match[] => {
        if (slots < 2) return [];

        // For double elimination, use the double elim generator
        if (isDoubleElim && config.format === 'Double Elimination') {
            return generateDoubleEliminationBracket(slots);
        }

        // Single elimination structure
        const bracket: Match[][] = [];
        const totalRounds = Math.log2(slots);

        for (let r = 0; r < totalRounds; r++) bracket.push([]);

        // Round 1 placeholder matches (no teams assigned yet)
        for (let i = 0; i < slots; i += 2) {
            const matchNum = i / 2 + 1;
            const totalR1 = slots / 2;
            let matchName = `Round 1 Match ${matchNum}`;
            if (totalR1 === 4) matchName = `Quarter-Final ${matchNum}`;
            else if (totalR1 === 2) matchName = `Semi-Final ${matchNum}`;
            else if (totalR1 === 1) matchName = 'Final';

            bracket[0].push({
                id: generateId(),
                round: 1,
                stage: 'playoff',
                format: config.upperBracketFormat || 'Bo3',
                name: matchName,
                team1: null,
                team2: null,
                score1: 0,
                score2: 0,
                startTime: null,
                winnerId: null,
                nextMatchId: null,
                loserMatchId: null,
            });
        }

        for (let r = 1; r < totalRounds; r++) {
            const matchesInRound = slots / Math.pow(2, r + 1);
            for (let m = 0; m < matchesInRound; m++) {
                const isGrandFinal = r === totalRounds - 1;
                let matchName = `Round ${r + 1} Match ${m + 1}`;
                if (isGrandFinal) matchName = matchesInRound === 1 ? 'Grand Final' : `Final ${m + 1}`;
                else if (matchesInRound === 2) matchName = `Semi-Final ${m + 1}`;
                else if (matchesInRound === 4) matchName = `Quarter-Final ${m + 1}`;

                bracket[r].push({
                    id: generateId(),
                    round: r + 1,
                    stage: 'playoff',
                    format: isGrandFinal
                        ? config.grandFinalFormat
                        : config.upperBracketFormat,
                    name: matchName,
                    team1: null,
                    team2: null,
                    score1: 0,
                    score2: 0,
                    startTime: null,
                    winnerId: null,
                    nextMatchId: null,
                    loserMatchId: null,
                });
            }
        }

        // Wire up nextMatchId within the playoff bracket
        for (let r = 0; r < totalRounds - 1; r++) {
            for (let m = 0; m < bracket[r].length; m++) {
                const nextRoundMatchIndex = Math.floor(m / 2);
                const nextMatch = bracket[r + 1][nextRoundMatchIndex];
                bracket[r][m].nextMatchId = nextMatch.id;
            }
        }

        const flat: Match[] = [];
        bracket.forEach(roundMatches => flat.push(...roundMatches));
        return flat;
    };

    // --- CASE 1: GROUP STAGE ENABLED ---
    if (config.hasGroupStage) {
        // 1) Group Stage Round-Robin
        // Escrims tournament logic:
        // 4 teams  -> 1 group of 4  (2 advance)
        // 8 teams  -> 2 groups of 4 (4 advance)
        // 12 teams -> 4 groups of 3 (8 advance)
        // 16 teams -> 4 groups of 4 (8 advance)
        // 24 teams -> 8 groups of 3 (16 advance)
        // 32 teams -> 8 groups of 4 (16 advance)
        let numGroups: number;
        if (totalTeams === 4) numGroups = 1;
        else if (totalTeams === 8) numGroups = 2;
        else if (totalTeams <= 16) numGroups = 4;
        else numGroups = 8;
        const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        const groups: Team[][] = [];
        let index = 0;
        for (let g = 0; g < numGroups; g++) {
            const groupSize = totalTeams / numGroups;
            groups.push(teams.slice(index, index + groupSize));
            index += groupSize;
        }

        groups.forEach((groupTeams, gIdx) => {
            const letter = labels[gIdx];
            // Round-robin: every team plays every other team once
            let matchCounter = 1;
            for (let i = 0; i < groupTeams.length; i++) {
                for (let j = i + 1; j < groupTeams.length; j++) {
                    const t1 = groupTeams[i];
                    const t2 = groupTeams[j];
                    matches.push({
                        id: generateId(),
                        round: 0,
                        stage: 'group',
                        format: config.groupStageFormat || 'Bo1',
                        name: `Group ${letter} Match ${matchCounter}`,
                        team1: t1,
                        team2: t2,
                        score1: 0,
                        score2: 0,
                        startTime: null,
                        winnerId: null,
                        nextMatchId: null,
                        loserMatchId: null,
                        group: letter,
                    });
                    matchCounter++;
                }
            }
        });

        // 2) Playoff placeholders — sized for advancing teams, not total teams
        // Top 2 from each group advance
        const advancingTeams = numGroups * 2;
        const playoffSlots = Math.pow(
            2,
            Math.ceil(Math.log2(Math.max(advancingTeams, 2)))
        ); // nearest power of 2 >= advancingTeams
        const isDoubleElim = config.format === 'Double Elimination';
        const playoffMatches = generatePlayoffBracket(playoffSlots, isDoubleElim);

        // Seed placeholder names into upper bracket R1 only
        // In double elim, upper R1 matches HAVE loserMatchId; in single elim they DON'T
        const playoffR1 = isDoubleElim
            ? playoffMatches.filter(m => m.round === 1 && m.stage === 'playoff' && !!m.loserMatchId)
            : playoffMatches.filter(m => m.round === 1 && m.stage === 'playoff');
        // Cross-seeding: 1st from Group A vs 2nd from Group B, etc.
        if (numGroups >= 2) {
            // Interleave: [1st A, 2nd B, 1st B, 2nd A, 1st C, 2nd D, 1st D, 2nd C, ...]
            const seedNames: string[] = [];
            for (let g = 0; g < numGroups; g += 2) {
                const gA = labels[g];
                const gB = labels[Math.min(g + 1, numGroups - 1)];
                seedNames.push(`1st Group ${gA}`, `2nd Group ${gB}`);
                if (g + 1 < numGroups) {
                    seedNames.push(`1st Group ${gB}`, `2nd Group ${gA}`);
                }
            }
            let seedIdx = 0;
            for (const slot of playoffR1) {
                if (seedIdx < seedNames.length) {
                    slot.team1 = { id: `seed-${seedIdx}`, name: seedNames[seedIdx] };
                    seedIdx++;
                }
                if (seedIdx < seedNames.length) {
                    slot.team2 = { id: `seed-${seedIdx}`, name: seedNames[seedIdx] };
                    seedIdx++;
                }
            }
        } else {
            // 1 group: just 1st vs 2nd
            if (playoffR1[0]) {
                playoffR1[0].team1 = { id: 'seed-0', name: `1st Group ${labels[0]}` };
                playoffR1[0].team2 = { id: 'seed-1', name: `2nd Group ${labels[0]}` };
            }
        }

        matches.push(...playoffMatches);

        return matches;
    }

    // --- CASE 2: DIRECT PLAYOFF BRACKET (NO GROUP STAGE) ---
    // At this point UI should have ensured totalTeams is a power of 2.
    if (totalTeams < 2) return matches;

    const slots = totalTeams;
    const isDoubleElim = config.format === 'Double Elimination';

    if (isDoubleElim) {
        // Use double elimination generator
        const playoffMatches = generateDoubleEliminationBracket(slots);
        // Seed teams into first round of upper bracket
        const upperR1Matches = playoffMatches.filter(m => m.round === 1 && !m.loserMatchId);
        let teamIndex = 0;
        for (const match of upperR1Matches) {
            match.team1 = teams[teamIndex] || null;
            match.team2 = teams[teamIndex + 1] || null;
            teamIndex += 2;
        }
        matches.push(...playoffMatches);
        return matches;
    }

    // Single elimination direct bracket
    const totalRounds = Math.log2(slots);
    const upperBracket: Match[][] = [];
    for (let r = 0; r < totalRounds; r++) upperBracket.push([]);

    // Round 1: seed teams directly
    for (let i = 0; i < teams.length; i += 2) {
        const matchNum = i / 2 + 1;
        const totalR1 = slots / 2;
        let matchName = `Round 1 Match ${matchNum}`;
        if (totalR1 === 4) matchName = `Quarter-Final ${matchNum}`;
        else if (totalR1 === 2) matchName = `Semi-Final ${matchNum}`;
        else if (totalR1 === 1) matchName = 'Final';

        upperBracket[0].push({
            id: generateId(),
            round: 1,
            stage: 'playoff',
            format: config.upperBracketFormat || 'Bo3',
            name: matchName,
            team1: teams[i] || null,
            team2: teams[i + 1] || null,
            score1: 0,
            score2: 0,
            startTime: null,
            winnerId: null,
            nextMatchId: null,
            loserMatchId: null,
        });
    }

    // Subsequent rounds
    for (let r = 1; r < totalRounds; r++) {
        const matchesInRound = slots / Math.pow(2, r + 1);
        for (let m = 0; m < matchesInRound; m++) {
            const isGrandFinal = r === totalRounds - 1;
            let matchName = `Round ${r + 1} Match ${m + 1}`;
            if (isGrandFinal) matchName = matchesInRound === 1 ? 'Grand Final' : `Final ${m + 1}`;
            else if (matchesInRound === 2) matchName = `Semi-Final ${m + 1}`;
            else if (matchesInRound === 4) matchName = `Quarter-Final ${m + 1}`;

            upperBracket[r].push({
                id: generateId(),
                round: r + 1,
                stage: 'playoff',
                format: isGrandFinal
                    ? config.grandFinalFormat
                    : config.upperBracketFormat,
                name: matchName,
                team1: null,
                team2: null,
                score1: 0,
                score2: 0,
                startTime: null,
                winnerId: null,
                nextMatchId: null,
                loserMatchId: null,
            });
        }
    }

    // Wire up nextMatchId
    for (let r = 0; r < totalRounds - 1; r++) {
        for (let m = 0; m < upperBracket[r].length; m++) {
            const nextRoundMatchIndex = Math.floor(m / 2);
            const nextMatch = upperBracket[r + 1][nextRoundMatchIndex];
            upperBracket[r][m].nextMatchId = nextMatch.id;
        }
    }

    upperBracket.forEach(roundMatches => matches.push(...roundMatches));
    return matches;
};
