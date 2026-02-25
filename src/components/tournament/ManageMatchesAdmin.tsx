import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Match, Team } from '../../lib/tournamentLogic';
import { Check, Clock, AlertTriangle, Calendar } from 'lucide-react';
import DateTimePicker from '../ui/DateTimePicker';

interface ManageMatchesAdminProps {
    tournamentId: string;
    onMatchUpdate?: () => void;
}

export default function ManageMatchesAdmin({ tournamentId, onMatchUpdate }: ManageMatchesAdminProps) {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStage, setFilterStage] = useState<string>('All');
    const [scores, setScores] = useState<Record<string, { s1: number, s2: number }>>({});
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [stages, setStages] = useState<string[]>([]);
    const [startTimes, setStartTimes] = useState<Record<string, string>>({});

    const getStageDisplayLabel = (stage: string) => {
        if (stage === 'group') return 'Group Stage';
        if (stage === 'playoff') return 'Playoff Bracket';
        return stage;
    };

    useEffect(() => {
        const fetchMatches = async () => {
            try {
                const q = query(collection(db, 'tournaments', tournamentId, 'matches'));
                const snapshot = await getDocs(q);
                const fetched: Match[] = [];
                const stageSet = new Set<string>();

                snapshot.forEach(d => {
                    const data = d.data() as Match;
                    fetched.push(data);
                    if (data.stage) stageSet.add(data.stage);
                });

                // Initialize scores object for empty ones
                const initScores: Record<string, { s1: number, s2: number }> = {};
                const initTimes: Record<string, string> = {};
                fetched.forEach(m => {
                    if (m.team1 && m.team2 && !m.winnerId) {
                        initScores[m.id] = {
                            s1: m.score1 || 0,
                            s2: m.score2 || 0
                        };
                    }
                    if (m.startTime) {
                        initTimes[m.id] = m.startTime.slice(0, 16);
                    }
                });

                setMatches(fetched.sort((a, b) => {
                    // Sort primarily by round numbers to keep flow logical
                    return (a.round || 0) - (b.round || 0);
                }));
                setScores(initScores);
                setStages(Array.from(stageSet).sort());
                setStartTimes(initTimes);
            } catch (error) {
                console.error("Failed to load matches for admin view", error);
            } finally {
                setLoading(false);
            }
        };

        fetchMatches();
    }, [tournamentId]);



    const handleScoreChange = (matchId: string, team: 1 | 2, value: number) => {
        setScores(prev => ({
            ...prev,
            [matchId]: {
                ...prev[matchId],
                [team === 1 ? 's1' : 's2']: value
            }
        }));
    };

    const validateScore = (s1: number, s2: number, format: string = 'Bo1'): { valid: boolean; message?: string } => {
        if (s1 === s2) {
            return { valid: false, message: 'Invalid score. Matches cannot end in a tie.' };
        }

        const max = Math.max(s1, s2);

        switch (format) {
            case 'Bo1':
                if (max !== 1) {
                    return { valid: false, message: 'Invalid score. A Bo1 must end in 1-0.' };
                }
                return { valid: true };
            case 'Bo3':
                if (max !== 2) {
                    return { valid: false, message: 'Invalid score. A Bo3 must end in 2-0 or 2-1.' };
                }
                return { valid: true };
            case 'Bo5':
                if (max !== 3) {
                    return { valid: false, message: 'Invalid score. A Bo5 must end in 3-0, 3-1, or 3-2.' };
                }
                return { valid: true };
            case 'Bo7':
                if (max !== 4) {
                    return { valid: false, message: 'Invalid score. A Bo7 must end in 4-0, 4-1, 4-2, or 4-3.' };
                }
                return { valid: true };
            default:
                return { valid: true };
        }
    };

    const handleSubmitScore = async (match: Match) => {
        if (!match.team1 || !match.team2) return;
        const currentScore = scores[match.id];
        if (!currentScore) return;

        const hasScore = currentScore.s1 !== 0 || currentScore.s2 !== 0;

        // If scores are 0-0, only update the schedule (no score validation)
        if (!hasScore) {
            const startTimeValue = startTimes[match.id] || null;
            if (!startTimeValue) {
                alert('Please set a date/time or enter scores.');
                return;
            }

            setSubmittingId(match.id);
            try {
                const batch = writeBatch(db);
                const matchRef = doc(db, 'tournaments', tournamentId, 'matches', match.id);
                batch.update(matchRef, { startTime: startTimeValue });
                await batch.commit();

                setMatches(prev => {
                    const ms = [...prev];
                    const ci = ms.findIndex(m => m.id === match.id);
                    if (ci > -1) {
                        ms[ci] = { ...ms[ci], startTime: startTimeValue };
                    }
                    return ms;
                });
                alert('Match schedule updated successfully!');
                onMatchUpdate?.();
            } catch (error) {
                console.error("Error updating match schedule:", error);
                alert("Failed to update schedule. Check console.");
            } finally {
                setSubmittingId(null);
            }
            return;
        }

        // Scores are set — validate and submit result
        const validation = validateScore(currentScore.s1, currentScore.s2, match.format);
        if (!validation.valid) {
            alert(validation.message || `Invalid score for format ${match.format || 'Bo1'}.`);
            return;
        }

        setSubmittingId(match.id);
        const winnerId = currentScore.s1 > currentScore.s2 ? match.team1.id : match.team2.id;

        const winnerObj = currentScore.s1 > currentScore.s2 ? match.team1 : match.team2;
        const loserObj = currentScore.s1 > currentScore.s2 ? match.team2 : match.team1;

        try {
            const batch = writeBatch(db);
            const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');

            // 1. Update Current Match
            const currentMatchRef = doc(matchesRef, match.id);
            const startTimeValue = startTimes[match.id] || null;
            batch.update(currentMatchRef, {
                score1: currentScore.s1,
                score2: currentScore.s2,
                winnerId: winnerId,
                startTime: startTimeValue,
                status: 'Completed'
            });

            // 2. Advance Winner -> nextMatchId
            if (match.nextMatchId) {
                const nextMatch = matches.find(m => m.id === match.nextMatchId);
                if (nextMatch) {
                    const nextMatchRef = doc(matchesRef, match.nextMatchId);
                    const payload: any = {};
                    if (!nextMatch.team1) {
                        payload.team1 = winnerObj;
                    } else if (!nextMatch.team2) {
                        payload.team2 = winnerObj;
                    } else {
                        console.warn("Target next match appears full already.");
                    }
                    if (Object.keys(payload).length > 0) {
                        batch.update(nextMatchRef, payload);
                    }
                }
            }

            // 3. Advance Loser -> loserMatchId (Double Elim)
            if (match.loserMatchId) {
                const loserMatch = matches.find(m => m.id === match.loserMatchId);
                if (loserMatch) {
                    const loserMatchRef = doc(matchesRef, match.loserMatchId);
                    const payload: any = {};
                    if (!loserMatch.team1) {
                        payload.team1 = loserObj;
                    } else if (!loserMatch.team2) {
                        payload.team2 = loserObj;
                    }
                    if (Object.keys(payload).length > 0) {
                        batch.update(loserMatchRef, payload);
                    }
                }
            }

            await batch.commit();

            // Build updated matches list for further logic
            const updatedMatches = matches.map(m => {
                if (m.id === match.id) {
                    return { ...m, score1: currentScore.s1, score2: currentScore.s2, winnerId, startTime: startTimes[match.id] || null };
                }
                if (match.nextMatchId && m.id === match.nextMatchId) {
                    const updated = { ...m };
                    if (!updated.team1) updated.team1 = winnerObj;
                    else if (!updated.team2) updated.team2 = winnerObj;
                    return updated;
                }
                if (match.loserMatchId && m.id === match.loserMatchId) {
                    const updated = { ...m };
                    if (!updated.team1) updated.team1 = loserObj;
                    else if (!updated.team2) updated.team2 = loserObj;
                    return updated;
                }
                return m;
            });

            // --- AUTO-ADVANCE: Group Stage → Playoffs ---
            if (match.stage === 'group') {
                const groupMatches = updatedMatches.filter(m => m.stage === 'group');
                const allGroupsDone = groupMatches.every(m => !!m.winnerId);

                if (allGroupsDone) {
                    // Compute standings per group
                    const groupNames = [...new Set(groupMatches.map(m => m.group).filter(Boolean))] as string[];
                    const qualifiedTeams: Team[] = [];

                    for (const groupName of groupNames) {
                        const gMatches = groupMatches.filter(m => m.group === groupName);
                        const teamStats: Record<string, { team: Team; wins: number; scoreDiff: number }> = {};

                        // Collect all teams in this group
                        for (const gm of gMatches) {
                            if (gm.team1 && !teamStats[gm.team1.id]) {
                                teamStats[gm.team1.id] = { team: gm.team1, wins: 0, scoreDiff: 0 };
                            }
                            if (gm.team2 && !teamStats[gm.team2.id]) {
                                teamStats[gm.team2.id] = { team: gm.team2, wins: 0, scoreDiff: 0 };
                            }
                        }

                        // Calculate wins and score differential
                        for (const gm of gMatches) {
                            if (gm.winnerId && gm.team1 && gm.team2) {
                                if (teamStats[gm.winnerId]) {
                                    teamStats[gm.winnerId].wins++;
                                }
                                const s1 = gm.score1 || 0;
                                const s2 = gm.score2 || 0;
                                if (teamStats[gm.team1.id]) teamStats[gm.team1.id].scoreDiff += (s1 - s2);
                                if (teamStats[gm.team2.id]) teamStats[gm.team2.id].scoreDiff += (s2 - s1);
                            }
                        }

                        // Sort by wins desc, then score diff desc
                        const sorted = Object.values(teamStats).sort((a, b) => {
                            if (b.wins !== a.wins) return b.wins - a.wins;
                            return b.scoreDiff - a.scoreDiff;
                        });

                        // Top 2 from each group advance
                        const advanceCount = Math.min(2, sorted.length);
                        for (let i = 0; i < advanceCount; i++) {
                            qualifiedTeams.push(sorted[i].team);
                        }
                    }

                    // Seed qualified teams into playoff round 1 slots
                    // Match slots that are empty or have placeholder seed teams (id starts with 'seed-')
                    const isSeedPlaceholder = (team: any) => !team || team.id?.startsWith('seed-');
                    const playoffR1 = updatedMatches
                        .filter(m => m.stage === 'playoff' && m.round === 1 && isSeedPlaceholder(m.team1) && isSeedPlaceholder(m.team2))
                        .sort((a, b) => a.id.localeCompare(b.id));

                    if (qualifiedTeams.length > 0 && playoffR1.length > 0) {
                        const seedBatch = writeBatch(db);
                        let teamIdx = 0;

                        for (const slot of playoffR1) {
                            const t1 = qualifiedTeams[teamIdx] || null;
                            const t2 = qualifiedTeams[teamIdx + 1] || null;
                            teamIdx += 2;

                            if (t1 || t2) {
                                const slotRef = doc(db, 'tournaments', tournamentId, 'matches', slot.id);
                                const payload: any = {};
                                if (t1) payload.team1 = t1;
                                if (t2) payload.team2 = t2;
                                seedBatch.update(slotRef, payload);

                                // Update local state too
                                const slotIdx = updatedMatches.findIndex(m => m.id === slot.id);
                                if (slotIdx > -1) {
                                    if (t1) updatedMatches[slotIdx] = { ...updatedMatches[slotIdx], team1: t1 };
                                    if (t2) updatedMatches[slotIdx] = { ...updatedMatches[slotIdx], team2: t2 };
                                }
                            }

                            if (teamIdx >= qualifiedTeams.length) break;
                        }

                        await seedBatch.commit();
                        alert(`Group stage complete! ${qualifiedTeams.length} teams have been seeded into the playoffs.`);
                    }
                }
            }

            // Update local state
            setMatches(updatedMatches);

            // Re-initialize scores for any newly-playable matches
            setScores(prev => {
                const updated = { ...prev };
                for (const m of updatedMatches) {
                    if (m.team1 && m.team2 && !m.winnerId && updated[m.id] === undefined) {
                        updated[m.id] = { s1: m.score1 || 0, s2: m.score2 || 0 };
                    }
                }
                return updated;
            });

            onMatchUpdate?.();

        } catch (error) {
            console.error("Error batch updating matches:", error);
            alert("Failed to submit score and auto-advance. Check console.");
        } finally {
            setSubmittingId(null);
        }
    };

    if (loading) return <div className="text-gray-500 py-10 text-center animate-pulse">Loading Bracket Matches...</div>;

    const filteredMatches = (filterStage === 'All'
        ? matches
        : matches.filter(m => m.stage === filterStage)
    ).sort((a, b) => {
        // Incomplete matches first, completed last
        const aComplete = a.winnerId ? 1 : 0;
        const bComplete = b.winnerId ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;
        // Within same status, sort by round
        return (a.round || 0) - (b.round || 0);
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-neutral-900/50 p-4 rounded-xl border border-white/10">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Check className="w-5 h-5 text-accent" /> Manage Match Results
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">Submit scores here to automatically advance teams through the bracket.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {stages.length > 0 && (
                        <select
                            value={stages.includes(filterStage) ? filterStage : 'All'}
                            onChange={(e) => setFilterStage(e.target.value)}
                            className="bg-black border border-white/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-accent"
                        >
                            <option value="All">All Stages</option>
                            {stages.map(s => (
                                <option key={s} value={s}>{getStageDisplayLabel(s)}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredMatches.map(match => {
                    const isPlayable = match.team1 && match.team2;
                    const isCompleted = !!match.winnerId;
                    const t1Name = match.team1?.name?.trim().toUpperCase();
                    const t2Name = match.team2?.name?.trim().toUpperCase();
                    const isByeMatch = t1Name === 'BYE' || t2Name === 'BYE' || (!match.team2 && !!match.team1);

                    const stagePill =
                        match.stage === 'group'
                            ? (match.group ? `Group ${match.group}` : 'Group Stage')
                            : `Playoffs R${match.round}`;

                    return (
                        <div key={match.id} className={`p-5 rounded-xl border ${isCompleted ? 'bg-green-900/10 border-green-500/20' : 'bg-neutral-900/50 border-white/10'} relative overflow-hidden`}>
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-mono tracking-widest text-accent uppercase font-bold px-2 py-1 bg-accent/10 rounded">
                                    {stagePill}
                                </span>
                                <div className="flex items-center gap-2">
                                    {isByeMatch && (
                                        <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded bg-white/5 text-gray-400 border border-white/10">
                                            Auto-Advance (BYE)
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-500 font-bold">
                                        {match.format || 'Bo1'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                {/* Team 1 */}
                                <div className={`flex items-center justify-between p-3 rounded-lg ${isCompleted && match.winnerId === match.team1?.id ? 'bg-green-500/10 text-green-400 font-bold' : 'bg-black/40 text-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                            {match.team1 ? (match.team1.logoUrl ? <img src={match.team1.logoUrl} className="w-full h-full rounded-full object-cover" alt="" /> : match.team1.name.substring(0, 2).toUpperCase()) : '?'}
                                        </div>
                                        <span className={!match.team1 ? 'italic text-gray-600' : ''}>
                                            {match.team1?.name || 'TBD'}
                                        </span>
                                    </div>
                                    {!isCompleted && isPlayable && scores[match.id] !== undefined && !isByeMatch && (
                                        <input
                                            type="number"
                                            min="0"
                                            value={scores[match.id].s1}
                                            onChange={(e) => handleScoreChange(match.id, 1, parseInt(e.target.value) || 0)}
                                            className="w-16 bg-black border border-white/20 rounded-md px-2 py-1 text-center font-mono focus:border-accent outline-none text-white"
                                        />
                                    )}
                                    {isCompleted && (
                                        <span className="font-mono text-xl">{match.score1}</span>
                                    )}
                                </div>

                                {/* Team 2 */}
                                <div className={`flex items-center justify-between p-3 rounded-lg ${isCompleted && match.winnerId === match.team2?.id ? 'bg-green-500/10 text-green-400 font-bold' : 'bg-black/40 text-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                            {match.team2 ? (match.team2.logoUrl ? <img src={match.team2.logoUrl} className="w-full h-full rounded-full object-cover" alt="" /> : match.team2.name.substring(0, 2).toUpperCase()) : '?'}
                                        </div>
                                        <span className={!match.team2 ? 'italic text-gray-600' : ''}>
                                            {match.team2?.name || 'TBD'}
                                        </span>
                                    </div>
                                    {!isCompleted && isPlayable && scores[match.id] !== undefined && !isByeMatch && (
                                        <input
                                            type="number"
                                            min="0"
                                            value={scores[match.id].s2}
                                            onChange={(e) => handleScoreChange(match.id, 2, parseInt(e.target.value) || 0)}
                                            className="w-16 bg-black border border-white/20 rounded-md px-2 py-1 text-center font-mono focus:border-accent outline-none text-white"
                                        />
                                    )}
                                    {isCompleted && (
                                        <span className="font-mono text-xl">{match.score2}</span>
                                    )}
                                </div>
                            </div>

                            {/* Match scheduling + Actions */}
                            <div className="mt-4 flex flex-col gap-3">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 text-xs text-gray-300">
                                        <Calendar className="w-3 h-3 text-accent" />
                                        <Clock className="w-3 h-3 text-accent" />
                                        <span className="font-bold uppercase tracking-widest">Match Time</span>
                                    </div>
                                    <DateTimePicker
                                        value={startTimes[match.id] ?? ''}
                                        onChange={(v) => setStartTimes(prev => ({ ...prev, [match.id]: v }))}
                                        placeholder="Set Match Date & Time"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    {isByeMatch ? (
                                        <div className="w-full flex items-center justify-between">
                                            <span className="text-xs text-gray-400">
                                                BYE matches auto-advance the seeded team. No score input needed.
                                            </span>
                                            <button
                                                disabled
                                                className="ml-3 px-3 py-1 text-xs font-bold rounded-lg bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                                            >
                                                Submit
                                            </button>
                                        </div>
                                    ) : !isPlayable && !isCompleted ? (
                                        <div className="text-xs text-yellow-500/70 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Waiting for previous matches...
                                        </div>
                                    ) : !isCompleted && isPlayable ? (
                                        <button
                                            onClick={() => handleSubmitScore(match)}
                                            disabled={submittingId === match.id || (!startTimes[match.id] && scores[match.id]?.s1 === 0 && scores[match.id]?.s2 === 0)}
                                            className="w-full bg-accent text-black font-bold py-2 rounded-lg hover:bg-accent/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {submittingId === match.id ? 'Submitting...' : 'Submit'}
                                        </button>
                                    ) : (
                                        <div className="text-xs text-green-400 font-bold flex items-center gap-1 w-full justify-center py-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                            <Check className="w-4 h-4" /> Match Completed
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filteredMatches.length === 0 && (
                    <div className="text-center text-gray-500 py-12 border border-white/5 rounded-2xl border-dashed">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No matches found for this stage.
                    </div>
                )}
            </div>
        </div>
    );
}