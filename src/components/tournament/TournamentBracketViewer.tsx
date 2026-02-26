import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Match, Tournament } from '../../lib/tournamentLogic';
import {
    SingleEliminationBracket,
    DoubleEliminationBracket,
    Match as BracketMatch,
    SVGViewer,
    createTheme
} from '@g-loot/react-tournament-brackets';
import { Download } from 'lucide-react';
import { StyleSheetManager } from 'styled-components';
import Toast from '../ui/Toast';

// Filter out custom props that the bracket library passes to DOM elements
const shouldForwardProp = (prop: string) => !['won', 'hovered', 'highlighted'].includes(prop);

const darkTheme = createTheme({
    textColor: { main: '#e2e2e8', highlighted: '#facc15', dark: '#555565' },
    matchBackground: { wonColor: '#141419', lostColor: '#141419' },
    score: {
        background: { wonColor: '#000000ff', lostColor: '#1e1e28' },
        text: { wonColor: '#ffffff', lostColor: '#6b7280' },
    },
    border: {
        color: '#2a2a35',
        highlightedColor: '#facc15',
    },
    roundHeader: { backgroundColor: '#0a0a0a', fontColor: '#facc15' },
    connectorColor: '#2a2a35',
    connectorColorHighlight: '#facc15',
    svgBackground: '#0a0a0a',
});

class BracketErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: any, info: any) {
        console.error('Error rendering tournament bracket:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex justify-center items-center h-64 border rounded-xl border-red-500/40 bg-black/40 text-red-400 font-mono text-sm">
                    Bracket view is temporarily unavailable.
                </div>
            );
        }
        return this.props.children;
    }
}

interface TournamentBracketViewerProps {
    tournamentId: string;
    refreshKey?: number;
}

export default function TournamentBracketViewer({ tournamentId, refreshKey }: TournamentBracketViewerProps) {
    const [matches, setMatches] = useState<Match[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [tournamentFormat, setTournamentFormat] = useState<'Single Elimination' | 'Double Elimination'>('Single Elimination');
    const [tournamentName, setTournamentName] = useState<string>('');
    const [showComingSoon, setShowComingSoon] = useState(false);

    useEffect(() => {
        const fetchMatchesAndTournament = async () => {
            try {
                const [matchesSnapshot, tournamentSnapshot] = await Promise.all([
                    getDocs(query(collection(db, `tournaments/${tournamentId}/matches`))),
                    getDoc(doc(db, 'tournaments', tournamentId)),
                ]);

                const fetchedMatches: Match[] = [];
                matchesSnapshot.forEach(d => {
                    fetchedMatches.push({ id: d.id, ...d.data() } as Match);
                });
                setMatches(fetchedMatches);

                if (tournamentSnapshot.exists()) {
                    const data = tournamentSnapshot.data() as Tournament;
                    setTournamentName(data.name || '');
                    const format = data.bracketConfig?.format || 'Single Elimination';
                    if (format === 'Double Elimination') {
                        setTournamentFormat('Double Elimination');
                    } else {
                        setTournamentFormat('Single Elimination');
                    }
                }
            } catch (err) {
                console.error("Error fetching tournament matches:", err);
                setError("Failed to load bracket data");
            } finally {
                setIsLoading(false);
            }
        };

        fetchMatchesAndTournament();
    }, [tournamentId, refreshKey]);

    const handleDownloadClick = useCallback(() => {
        setShowComingSoon(true);
    }, []);

    const formatForSingleElimination = (internalMatches: Match[]) => {
        if (!internalMatches || internalMatches.length === 0) return [];

        const playoffMatches = internalMatches.filter(m => m && m.stage === 'playoff');
        if (playoffMatches.length === 0) return [];

        const matchMap: Record<string, Match> = {};
        playoffMatches.forEach(m => { if (m?.id) matchMap[m.id] = m; });

        return playoffMatches.map(m => {
            const nextId = m?.nextMatchId ?? null;
            const hasValidNext = !!(nextId && matchMap[nextId]);
            const roundLabel = m?.name || `Playoffs R${m?.round ?? 1}`;

            return {
                id: m?.id || 'unknown',
                nextMatchId: hasValidNext ? nextId : null,
                tournamentRoundText: roundLabel,
                startTime: m?.name || '',
                state: m?.winnerId ? 'DONE' : 'SCHEDULED',
                participants: [
                    {
                        id: m?.team1?.id || `tbd-1-${m?.id ?? 'unknown'}`,
                        resultText: m?.score1 !== null && m?.score1 !== undefined ? String(m.score1) : null,
                        isWinner: m?.winnerId === m?.team1?.id,
                        status: null,
                        name: m?.team1?.name || 'TBD',
                        picture: m?.team1?.logoUrl || '',
                    },
                    {
                        id: m?.team2?.id || `tbd-2-${m?.id ?? 'unknown'}`,
                        resultText: m?.score2 !== null && m?.score2 !== undefined ? String(m.score2) : null,
                        isWinner: m?.winnerId === m?.team2?.id,
                        status: null,
                        name: m?.team2?.name || 'TBD',
                        picture: m?.team2?.logoUrl || '',
                    },
                ],
            };
        });
    };

    const formatForDoubleElimination = (internalMatches: Match[]) => {
        if (!internalMatches || internalMatches.length === 0) return { upper: [], lower: [] };

        const playoffMatches = internalMatches.filter(m => m && m.stage === 'playoff');
        if (playoffMatches.length === 0) return { upper: [], lower: [] };

        const matchMap: Record<string, Match> = {};
        playoffMatches.forEach(m => { if (m?.id) matchMap[m.id] = m; });

        const upper: any[] = [];
        const lower: any[] = [];
        const lowerMatchIds = new Set<string>();

        playoffMatches.forEach(m => {
            if (m?.loserMatchId) lowerMatchIds.add(m.loserMatchId);
        });

        playoffMatches.forEach(m => {
            const nextId = m?.nextMatchId ?? null;
            const loserNextId = m?.loserMatchId ?? null;
            const hasValidNext = !!(nextId && matchMap[nextId]);
            const hasValidLoserNext = !!(loserNextId && matchMap[loserNextId]);
            const isGrandFinal = !hasValidNext && !lowerMatchIds.has(m?.id || '');

            const roundLabel = isGrandFinal
                ? 'Grand Final'
                : (m?.name || `Playoffs R${m?.round ?? 1}`);

            const base = {
                id: m?.id || 'unknown',
                nextMatchId: hasValidNext ? nextId : null,
                nextLooserMatchId: hasValidLoserNext ? loserNextId : null,
                tournamentRoundText: roundLabel,
                startTime: m?.name || '',
                state: m?.winnerId ? 'DONE' : 'SCHEDULED',
                participants: [
                    {
                        id: m?.team1?.id || `tbd-1-${m?.id ?? 'unknown'}`,
                        resultText: m?.score1 !== null && m?.score1 !== undefined ? String(m.score1) : null,
                        isWinner: m?.winnerId === m?.team1?.id,
                        status: null,
                        name: m?.team1?.name || 'TBD',
                        picture: m?.team1?.logoUrl || '',
                    },
                    {
                        id: m?.team2?.id || `tbd-2-${m?.id ?? 'unknown'}`,
                        resultText: m?.score2 !== null && m?.score2 !== undefined ? String(m.score2) : null,
                        isWinner: m?.winnerId === m?.team2?.id,
                        status: null,
                        name: m?.team2?.name || 'TBD',
                        picture: m?.team2?.logoUrl || '',
                    },
                ],
            };

            if (lowerMatchIds.has(m?.id || '')) {
                lower.push(base);
            } else if (isGrandFinal) {
                upper.push(base);
            } else {
                upper.push(base);
            }
        });

        return { upper, lower };
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64 border rounded-xl border-white/10 bg-[#0a0a0a]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
        );
    }

    if (error || matches.length === 0) {
        return (
            <div className="flex justify-center items-center h-64 border rounded-xl border-white/10 bg-[#0a0a0a] text-gray-500 font-mono text-sm">
                Bracket data not available yet
            </div>
        );
    }

    const singleElimMatches = formatForSingleElimination(matches);
    const doubleElimMatches = formatForDoubleElimination(matches);

    return (
        <div className="w-full bg-[#0d0d12] border border-white/10 rounded-2xl overflow-hidden">
            {/* Header bar with title + download button */}
            <div className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-accent/5 to-transparent flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-3 text-accent uppercase tracking-[0.15em] font-display">
                    Playoff Bracket
                </h3>
                <button
                    onClick={handleDownloadClick}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition font-bold text-sm"
                >
                    <Download className="w-4 h-4" />
                    Download Bracket
                </button>
            </div>

            {/* Bracket Container with Branding */}
            <div className="w-full overflow-x-auto custom-scrollbar">
                <div className="relative min-w-fit bg-[#0a0a0a] text-[#e2e2e8]">
                    {/* Tournament Name Header */}
                    <div className="pt-6 pb-2 px-8">
                        <h1 className="text-4xl font-black text-yellow-400 text-center tracking-widest uppercase select-none">
                            {tournamentName || 'TOURNAMENT'}
                        </h1>
                        <p className="text-center text-gray-600 text-xs font-mono tracking-[0.3em] uppercase mt-1">
                            {tournamentFormat} Bracket
                        </p>
                    </div>

                    {/* Bracket SVG */}
                    <div className="bracket-dark-wrapper p-6 flex items-start justify-center">
                        <StyleSheetManager shouldForwardProp={shouldForwardProp}>
                            <BracketErrorBoundary>
                                {tournamentFormat === 'Double Elimination' ? (
                                    <DoubleEliminationBracket
                                        theme={darkTheme}
                                        matches={doubleElimMatches}
                                        matchComponent={BracketMatch}
                                        svgWrapper={({ children, ...props }: { children: React.ReactNode } & any) => (
                                            <SVGViewer
                                                width={10000}
                                                height={5000}
                                                background="#0a0a0a"
                                                SVGAlign="xMidYMin"
                                                {...props}
                                            >
                                                {children}
                                            </SVGViewer>
                                        )}
                                    />
                                ) : (
                                    <SingleEliminationBracket
                                        theme={darkTheme}
                                        matches={singleElimMatches}
                                        matchComponent={BracketMatch}
                                        svgWrapper={({ children, ...props }: { children: React.ReactNode } & any) => (
                                            <SVGViewer
                                                width={10000}
                                                height={5000}
                                                background="#0a0a0a"
                                                SVGAlign="xMidYMin"
                                                {...props}
                                            >
                                                {children}
                                            </SVGViewer>
                                        )}
                                    />
                                )}
                            </BracketErrorBoundary>
                        </StyleSheetManager>
                    </div>

                    {/* Footer branding */}
                    <div className="pb-6 px-8">
                        <p className="text-center text-yellow-400/50 text-sm font-bold font-mono tracking-[0.3em] uppercase">
                            Generated by ESCRIMS • escrims.com
                        </p>
                    </div>
                </div>
            </div>

            <Toast
                message="Coming Soon"
                type="info"
                isVisible={showComingSoon}
                onClose={() => setShowComingSoon(false)}
            />
        </div>
    );
}
