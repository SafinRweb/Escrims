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
}

interface Tournament {
    id: string;
    name: string;
    teams: Team[];
    matches: Match[];
    status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'ongoing' | 'completed';
}

export const shuffleTeams = (teams: { name: string; logoUrl?: string }[]): Team[] => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    return shuffled.map((t, index) => ({
        id: `team-${index + 1}`,
        name: t.name,
        logoUrl: t.logoUrl || '',
    }));
};

export const generateMatches = (teams: Team[]): Match[] => {
    const matches: Match[] = [];
    // Simple single elimination bracket generation for Round 1
    // If odd number, one team gets a bye (handled simply here by assuming even or null)

    for (let i = 0; i < teams.length; i += 2) {
        const team1 = teams[i];
        const team2 = teams[i + 1] || null; // Bye if null

        matches.push({
            id: `match-${matches.length + 1}`,
            round: 1,
            team1,
            team2,
            score1: 0,
            score2: 0,
            startTime: null, // To be set by organizer
            winnerId: null,
        });
    }
    return matches;
};
