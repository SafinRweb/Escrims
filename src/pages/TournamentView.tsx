import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Save, Trophy, Trash2, Download, Edit2, X, Users, ExternalLink, Tv } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import type { Tournament, Match, Team } from '../lib/tournamentLogic';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { ADMIN_EMAILS } from '../lib/admins';
import Toast from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function TournamentView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
    const [editScore1, setEditScore1] = useState<number>(0);
    const [editScore2, setEditScore2] = useState<number>(0);
    const [editTime, setEditTime] = useState<string>('');

    // Team editing state
    const [editingTeams, setEditingTeams] = useState(false);
    const [editTeamData, setEditTeamData] = useState<{ id: string; name: string; logoUrl: string }[]>([]);

    // Tournament info editing state
    const [editingInfo, setEditingInfo] = useState(false);
    const [editDescription, setEditDescription] = useState('');
    const [editImageUrl, setEditImageUrl] = useState('');
    const [editStreamLink, setEditStreamLink] = useState('');

    // Toast state
    const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
        message: '', type: 'info', visible: false
    });
    const showToast = (message: string, type: ToastType) => setToast({ message, type, visible: true });

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
        open: false, title: '', message: '', onConfirm: () => { }
    });

    useEffect(() => {
        const fetchTournament = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, "tournaments", id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setTournament(docSnap.data() as Tournament);
                } else {
                    console.log("No such tournament!");
                }
            } catch (error) {
                console.error("Error fetching tournament:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTournament();
    }, [id]);

    const isOwner = currentUser && (tournament as any)?.organizerId === currentUser.uid;
    const isAdmin = currentUser && currentUser.email && ADMIN_EMAILS.includes(currentUser.email);
    const canManage = isOwner || isAdmin;
    const isApproved = (tournament as any)?.status === 'approved';

    // Start editing a match
    const startEditMatch = (match: Match) => {
        setEditingMatchId(match.id);
        setEditScore1(match.score1 || 0);
        setEditScore2(match.score2 || 0);
        setEditTime(match.startTime || '');
    };

    // Save match with score — moves it to completed
    const saveMatch = async () => {
        if (!tournament || !id || !editingMatchId) return;

        // Validate date+time: if a date is entered but time is missing (or vice versa)
        if (editTime) {
            const parts = editTime.split('T');
            const datePart = parts[0] || '';
            const timePart = parts[1] || '';

            if (datePart && !timePart) {
                showToast("Please set the time of the match along with the date.", "error");
                return;
            }
            if (timePart && !datePart) {
                showToast("Please set the date of the match along with the time.", "error");
                return;
            }

            // Warn if date is invalid
            if (isNaN(new Date(editTime).getTime())) {
                showToast("Invalid date. Please enter a valid date.", "error");
                return;
            }

            // Warn if date is in the past
            if (new Date(editTime) < new Date()) {
                showToast("Warning: The match date you entered is in the past.", "warning");
            }
        }

        try {
            const updatedMatches = tournament.matches.map(m => {
                if (m.id !== editingMatchId) return m;

                const hasScore = editScore1 !== 0 || editScore2 !== 0;
                let winnerId: string | null = null;

                if (hasScore && m.team1 && m.team2) {
                    winnerId = editScore1 > editScore2 ? m.team1.id : editScore2 > editScore1 ? m.team2.id : null;
                }

                return {
                    ...m,
                    score1: editScore1,
                    score2: editScore2,
                    startTime: editTime || m.startTime,
                    winnerId
                };
            });

            const docRef = doc(db, "tournaments", id);
            await updateDoc(docRef, { matches: updatedMatches });
            setTournament({ ...tournament, matches: updatedMatches });
            setEditingMatchId(null);
            showToast("Match updated successfully!", "success");
        } catch (error) {
            console.error("Error updating match:", error);
            showToast("Failed to update match.", "error");
        }
    };

    // Start editing teams
    const startEditTeams = () => {
        if (!tournament) return;
        setEditTeamData(tournament.teams.map((t: any) => ({
            id: typeof t === 'string' ? t : t.id,
            name: typeof t === 'string' ? t : t.name,
            logoUrl: typeof t === 'string' ? '' : (t.logoUrl || ''),
        })));
        setEditingTeams(true);
    };

    const saveTeamEdits = async () => {
        if (!tournament || !id) return;
        try {
            const updatedTeams = editTeamData.map(t => ({
                id: t.id,
                name: t.name,
                logoUrl: t.logoUrl,
            }));

            // Also update team references in matches
            const teamMap: Record<string, { id: string; name: string; logoUrl?: string }> = {};
            updatedTeams.forEach(t => { teamMap[t.id] = t; });

            const updatedMatches = tournament.matches.map(m => ({
                ...m,
                team1: m.team1 && teamMap[m.team1.id] ? { ...m.team1, name: teamMap[m.team1.id].name, logoUrl: teamMap[m.team1.id].logoUrl } : m.team1,
                team2: m.team2 && teamMap[m.team2.id] ? { ...m.team2, name: teamMap[m.team2.id].name, logoUrl: teamMap[m.team2.id].logoUrl } : m.team2,
            }));

            const docRef = doc(db, "tournaments", id);
            await updateDoc(docRef, { teams: updatedTeams, matches: updatedMatches });
            setTournament({ ...tournament, teams: updatedTeams as Team[], matches: updatedMatches });
            setEditingTeams(false);
            showToast("Team details updated!", "success");
        } catch (error) {
            console.error("Error updating teams:", error);
            showToast("Failed to update team details.", "error");
        }
    };

    // Start editing tournament info
    const startEditInfo = () => {
        if (!tournament) return;
        setEditDescription((tournament as any).description || '');
        setEditImageUrl((tournament as any).imageUrl || '');
        setEditStreamLink((tournament as any).streamLink || '');
        setEditingInfo(true);
    };

    const saveInfoEdits = async () => {
        if (!tournament || !id) return;
        try {
            const docRef = doc(db, "tournaments", id);
            await updateDoc(docRef, {
                description: editDescription,
                imageUrl: editImageUrl,
                streamLink: editStreamLink,
            });
            setTournament({ ...tournament, description: editDescription, imageUrl: editImageUrl, streamLink: editStreamLink } as any);
            setEditingInfo(false);
            showToast("Tournament info updated!", "success");
        } catch (error) {
            console.error("Error updating info:", error);
            showToast("Failed to update tournament info.", "error");
        }
    };

    const handleDelete = () => {
        if (!id) return;
        setConfirmModal({
            open: true,
            title: 'Delete Tournament',
            message: 'Are you sure you want to delete this tournament? This action cannot be undone.',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, "tournaments", id));
                    setConfirmModal(prev => ({ ...prev, open: false }));
                    showToast("Tournament deleted successfully.", "success");
                    setTimeout(() => navigate('/dashboard'), 1000);
                } catch (error) {
                    console.error("Error deleting tournament:", error);
                    showToast("Failed to delete tournament.", "error");
                    setConfirmModal(prev => ({ ...prev, open: false }));
                }
            }
        });
    };

    const handleExport = () => {
        showToast("Coming Soon! Export feature is under development.", "info");
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
                </div>
            </div>
        );
    }

    if (!tournament) {
        return (
            <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <p>Tournament not found.</p>
                </div>
            </div>
        );
    }

    // Split matches into upcoming and completed
    const upcomingMatches = tournament.matches.filter(m => !m.winnerId);
    const completedMatches = tournament.matches.filter(m => m.winnerId);

    // Compute team stats: kills (scores for), deaths (scores against), points (wins)
    const teamStats: Record<string, { kills: number; deaths: number; pts: number }> = {};
    tournament.teams.forEach((t: any) => {
        const teamId = typeof t === 'string' ? t : t.id;
        teamStats[teamId] = { kills: 0, deaths: 0, pts: 0 };
    });
    completedMatches.forEach(m => {
        if (m.team1 && m.team2) {
            if (teamStats[m.team1.id]) {
                teamStats[m.team1.id].kills += m.score1 || 0;
                teamStats[m.team1.id].deaths += m.score2 || 0;
            }
            if (teamStats[m.team2.id]) {
                teamStats[m.team2.id].kills += m.score2 || 0;
                teamStats[m.team2.id].deaths += m.score1 || 0;
            }
        }
        if (m.winnerId && teamStats[m.winnerId]) {
            teamStats[m.winnerId].pts++;
        }
    });

    // Format date as DD/MM/YYYY
    const formatDate = (dateStr: string | null): string => {
        if (!dateStr) return 'TBD';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'TBD';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${mins}`;
    };

    // Check if a match date has passed (only returns true if there IS a date and it's in the past)
    const isDatePassed = (startTime: string | null): boolean => {
        if (!startTime) return false;
        const d = new Date(startTime);
        if (isNaN(d.getTime())) return false;
        return d < new Date();
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-24">

                {/* Header */}
                <div className="flex flex-col md:flex-row gap-8 mb-12 animate-fade-in">
                    {/* Logo */}
                    <div className="w-32 h-32 md:w-48 md:h-48 bg-white/5 rounded-2xl flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                        {(tournament as any).imageUrl ? (
                            <img src={(tournament as any).imageUrl} alt={tournament.name} className="w-full h-full object-cover" />
                        ) : (
                            <Trophy className="w-16 h-16 text-gray-600" />
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-wide mb-4 text-white">
                            {tournament.name}
                        </h1>
                        <p className="text-gray-400 text-lg mb-6 max-w-2xl leading-relaxed">
                            {(tournament as any).description || "No description provided."}
                        </p>

                        <div className="flex flex-wrap gap-4 text-sm font-bold uppercase tracking-wider text-gray-500">
                            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg">
                                <Trophy className="w-4 h-4 text-accent" /> {tournament.teams.length} Teams
                            </div>
                            <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg">
                                <Clock className="w-4 h-4 text-accent" /> {tournament.matches.length} Matches
                            </div>
                            {(tournament as any).prizePool && (
                                <div className="flex items-center gap-2 bg-accent/10 px-4 py-2 rounded-lg text-accent">
                                    💰 {(tournament as any).prizePool}
                                </div>
                            )}
                            {(tournament as any).streamLink && (
                                <a
                                    href={(tournament as any).streamLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 bg-purple-500/10 px-4 py-2 rounded-lg text-purple-400 hover:bg-purple-500/20 transition"
                                >
                                    <Tv className="w-4 h-4" /> Live Stream <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Actions — only for owner/admin */}
                    {canManage && (
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={startEditInfo}
                                className="bg-white/10 text-white font-bold px-6 py-3 rounded-xl hover:bg-white/20 transition flex items-center gap-2 justify-center border border-white/10"
                            >
                                <Edit2 className="w-5 h-5" /> Edit Info
                            </button>
                            <button
                                onClick={handleExport}
                                className="bg-accent text-black font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition flex items-center gap-2 justify-center"
                            >
                                <Download className="w-5 h-5" /> Export Table
                            </button>
                            <button
                                onClick={handleDelete}
                                className="bg-red-500/10 text-red-500 font-bold px-6 py-3 rounded-xl hover:bg-red-500/20 transition flex items-center gap-2 justify-center border border-red-500/20"
                            >
                                <Trash2 className="w-5 h-5" /> Delete Tournament
                            </button>
                        </div>
                    )}
                </div>

                {/* ============ EDIT TOURNAMENT INFO PANEL ============ */}
                {editingInfo && (
                    <div className="bg-neutral-900/80 border border-accent/30 rounded-2xl p-6 mb-12 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-bold flex items-center gap-2"><Edit2 className="w-5 h-5 text-accent" /> Edit Tournament Info</h4>
                            <button onClick={() => setEditingInfo(false)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white resize-none h-28 focus:outline-none focus:border-accent"
                                    placeholder="Tournament description..."
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Logo URL</label>
                                    <input
                                        type="text"
                                        value={editImageUrl}
                                        onChange={(e) => setEditImageUrl(e.target.value)}
                                        className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent text-sm"
                                        placeholder="https://example.com/logo.png"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2"><Tv className="w-4 h-4 text-purple-400" /> Livestream Link</label>
                                    <input
                                        type="text"
                                        value={editStreamLink}
                                        onChange={(e) => setEditStreamLink(e.target.value)}
                                        className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent text-sm"
                                        placeholder="https://youtube.com/live/... or https://twitch.tv/..."
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={() => setEditingInfo(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
                            <button onClick={saveInfoEdits} className="bg-accent text-black font-bold px-6 py-2 rounded-lg hover:bg-accent/90 flex items-center gap-2 text-sm">
                                <Save className="w-4 h-4" /> Save Changes
                            </button>
                        </div>
                    </div>
                )}

                {/* ============ STANDINGS TABLE ============ */}
                <div className="mb-12">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold font-display uppercase text-gray-300 flex items-center gap-3">
                            <Trophy className="w-6 h-6 text-accent" /> Standings
                        </h3>
                        {canManage && !editingTeams && (
                            <button onClick={startEditTeams} className="text-sm text-gray-400 hover:text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10 transition">
                                <Edit2 className="w-4 h-4" /> Edit Teams
                            </button>
                        )}
                    </div>

                    {/* Team editing panel */}
                    {editingTeams && (
                        <div className="bg-neutral-900/80 border border-accent/30 rounded-2xl p-6 mb-6 animate-fade-in">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-bold flex items-center gap-2"><Users className="w-5 h-5 text-accent" /> Edit Team Details</h4>
                                <button onClick={() => setEditingTeams(false)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                                {editTeamData.map((team, i) => (
                                    <div key={team.id} className="flex items-center gap-3 flex-wrap bg-white/5 border border-white/10 rounded-xl p-3">
                                        <span className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{i + 1}</span>
                                        {team.logoUrl ? (
                                            <img src={team.logoUrl} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                                        ) : (
                                            <div className="w-8 h-8 bg-neutral-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                {team.name ? team.name.substring(0, 2).toUpperCase() : '?'}
                                            </div>
                                        )}
                                        <input
                                            value={team.name}
                                            onChange={e => { const d = [...editTeamData]; d[i] = { ...d[i], name: e.target.value }; setEditTeamData(d); }}
                                            className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-white placeholder-gray-600"
                                            placeholder="Team Name"
                                        />
                                        <input
                                            value={team.logoUrl}
                                            onChange={e => { const d = [...editTeamData]; d[i] = { ...d[i], logoUrl: e.target.value }; setEditTeamData(d); }}
                                            className="w-full sm:w-48 bg-neutral-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent/50"
                                            placeholder="Logo URL (optional)"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end gap-3 mt-4">
                                <button onClick={() => setEditingTeams(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
                                <button onClick={saveTeamEdits} className="bg-accent text-black font-bold px-6 py-2 rounded-lg hover:bg-accent/90 flex items-center gap-2 text-sm">
                                    <Save className="w-4 h-4" /> Save Changes
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/5 text-gray-400 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-3 md:px-6 py-4 w-12">#</th>
                                    <th className="px-3 md:px-6 py-4">Team</th>
                                    <th className="px-2 md:px-4 py-4 text-center">Kills</th>
                                    <th className="px-2 md:px-4 py-4 text-center">Deaths</th>
                                    <th className="px-2 md:px-4 py-4 text-center">KD</th>
                                    <th className="px-2 md:px-4 py-4 text-right">Points</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {tournament.teams
                                    .map((team: any, i: number) => {
                                        const teamName = typeof team === 'string' ? team : team.name;
                                        const teamId = typeof team === 'string' ? team : team.id;
                                        const stats = teamStats[teamId] || { kills: 0, deaths: 0, pts: 0 };
                                        const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills > 0 ? stats.kills.toFixed(2) : '0.00';
                                        const logoUrl = typeof team === 'string' ? '' : (team.logoUrl || '');
                                        return { teamName, teamId, ...stats, kd, logoUrl, idx: i };
                                    })
                                    .sort((a, b) => b.pts - a.pts || b.kills - a.kills)
                                    .map((t, rank) => (
                                        <tr key={t.idx} className="hover:bg-white/5 transition-colors">
                                            <td className="px-3 md:px-6 py-4">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rank === 0 && t.pts > 0 ? 'bg-accent text-black' : 'bg-white/10 text-gray-400'}`}>
                                                    {rank + 1}
                                                </div>
                                            </td>
                                            <td className="px-3 md:px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {t.logoUrl ? (
                                                        <img src={t.logoUrl} alt={t.teamName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                    ) : (
                                                        <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">
                                                            {t.teamName?.substring(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="font-bold">{t.teamName}</span>
                                                </div>
                                            </td>
                                            <td className="px-2 md:px-4 py-4 text-center">
                                                <span className="font-mono font-bold text-green-400">{t.kills}</span>
                                            </td>
                                            <td className="px-2 md:px-4 py-4 text-center">
                                                <span className="font-mono font-bold text-red-400">{t.deaths}</span>
                                            </td>
                                            <td className="px-2 md:px-4 py-4 text-center">
                                                <span className="font-mono font-bold text-gray-300">{t.kd}</span>
                                            </td>
                                            <td className="px-2 md:px-4 py-4 text-right">
                                                <span className="font-mono font-bold text-accent">{t.pts}</span>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ============ UPCOMING MATCHES ============ */}
                <div className="mb-12">
                    <h3 className="text-2xl font-bold font-display uppercase mb-6 text-gray-300 flex items-center gap-3">
                        <Clock className="w-6 h-6 text-yellow-500" /> Upcoming Matches
                    </h3>
                    {upcomingMatches.length === 0 ? (
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-12 text-center text-gray-500">
                            No upcoming matches.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {upcomingMatches.map((match, idx) => (
                                <div key={match.id} className="bg-neutral-900/50 border border-white/10 rounded-xl p-5">
                                    {editingMatchId === match.id ? (
                                        /* ---- EDIT MODE ---- */
                                        <div className="space-y-4">
                                            {/* Teams & Scores — card layout for mobile */}
                                            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                                                {/* Team 1 + Score */}
                                                <div className="flex items-center gap-3 w-full sm:flex-1 justify-center sm:justify-end">
                                                    <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                        {match.team1?.name?.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="font-bold truncate">{match.team1?.name}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={editScore1}
                                                        onChange={(e) => setEditScore1(parseInt(e.target.value) || 0)}
                                                        className="w-14 bg-black border border-white/20 rounded-lg px-2 py-1.5 text-center font-mono font-bold text-white text-lg"
                                                    />
                                                </div>

                                                <span className="text-gray-600 font-bold text-lg">VS</span>

                                                {/* Team 2 + Score */}
                                                <div className="flex items-center gap-3 w-full sm:flex-1 justify-center sm:justify-start">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={editScore2}
                                                        onChange={(e) => setEditScore2(parseInt(e.target.value) || 0)}
                                                        className="w-14 bg-black border border-white/20 rounded-lg px-2 py-1.5 text-center font-mono font-bold text-white text-lg"
                                                    />
                                                    <span className="font-bold truncate">{match.team2?.name || 'BYE'}</span>
                                                    <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                        {match.team2?.name?.substring(0, 2).toUpperCase() || '—'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Time + Save */}
                                            <div className="space-y-2">
                                                <p className="text-xs text-gray-500">📅 Set the match date and time. Both date and time are required.</p>
                                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                                                        <input
                                                            type="datetime-local"
                                                            value={editTime}
                                                            onChange={(e) => setEditTime(e.target.value)}
                                                            className="bg-black border border-white/20 rounded-lg px-3 py-2 text-sm text-white w-full min-w-0"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 shrink-0">
                                                        <button
                                                            onClick={() => setEditingMatchId(null)}
                                                            className="px-4 py-2 text-gray-400 hover:text-white transition text-sm flex-1 sm:flex-none"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={saveMatch}
                                                            className="bg-accent text-black font-bold px-5 py-2 rounded-lg hover:bg-accent/90 transition flex items-center justify-center gap-2 text-sm flex-1 sm:flex-none"
                                                        >
                                                            <Save className="w-4 h-4" /> Save
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-yellow-500/70">⚠️ Enter the score and save to mark a match as completed. Leave score at 0-0 to keep it upcoming.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ---- VIEW MODE ---- */
                                        <div>
                                            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                                                <span className="text-gray-500 font-mono text-sm hidden sm:block w-8">#{idx + 1}</span>

                                                {/* Team 1 */}
                                                <div className="flex items-center gap-3 sm:flex-1 sm:justify-end w-full sm:w-auto justify-center">
                                                    <span className="font-bold text-white sm:text-right truncate">{match.team1?.name}</span>
                                                    {match.team1?.logoUrl ? (
                                                        <img src={match.team1.logoUrl} alt={match.team1.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                            {match.team1?.name?.substring(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* VS / TBA */}
                                                <div className="px-4 text-center min-w-[60px]">
                                                    {match.startTime && isDatePassed(match.startTime) && !match.score1 && !match.score2 ? (
                                                        <span className="text-yellow-500 font-bold text-sm">TBA</span>
                                                    ) : (
                                                        <span className="text-accent font-bold text-lg">VS</span>
                                                    )}
                                                </div>

                                                {/* Team 2 */}
                                                <div className="flex items-center gap-3 sm:flex-1 w-full sm:w-auto justify-center">
                                                    {match.team2 ? (
                                                        <>
                                                            {match.team2.logoUrl ? (
                                                                <img src={match.team2.logoUrl} alt={match.team2.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                                                            ) : (
                                                                <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                                    {match.team2.name.substring(0, 2).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <span className="font-bold text-white truncate">{match.team2.name}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-500 italic">BYE</span>
                                                    )}
                                                </div>

                                                {/* Edit button — owner only after approval */}
                                                {isOwner && isApproved && (
                                                    <button
                                                        onClick={() => startEditMatch(match)}
                                                        className="p-2 hover:bg-white/10 rounded-lg transition text-gray-400 hover:text-white shrink-0"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Schedule — shown below on mobile */}
                                            {match.startTime && (
                                                <div className="text-sm text-gray-400 mt-2 flex items-center gap-2 justify-center sm:justify-start">
                                                    <Clock className="w-4 h-4" />
                                                    {formatDate(match.startTime)}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ============ COMPLETED MATCHES ============ */}
                <div className="mb-12">
                    <h3 className="text-2xl font-bold font-display uppercase mb-6 text-gray-300 flex items-center gap-3">
                        <Trophy className="w-6 h-6 text-green-500" /> Completed Matches
                    </h3>
                    {completedMatches.length === 0 ? (
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-12 text-center text-gray-500">
                            No completed matches yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {completedMatches.map((match, idx) => {
                                const team1Won = match.winnerId === match.team1?.id;
                                const team2Won = match.winnerId === match.team2?.id;
                                return (
                                    <div key={match.id} className="bg-neutral-900/50 border border-white/10 rounded-xl p-5">
                                        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                                            <span className="text-gray-500 font-mono text-sm hidden sm:block w-8">#{idx + 1}</span>

                                            {/* Team 1 */}
                                            <div className={`flex items-center gap-3 sm:flex-1 sm:justify-end w-full sm:w-auto justify-center ${team1Won ? 'text-green-400' : 'text-gray-400'}`}>
                                                <span className={`font-bold sm:text-right truncate ${team1Won ? '' : 'line-through opacity-50'}`}>{match.team1?.name}</span>
                                                {match.team1?.logoUrl ? (
                                                    <img src={match.team1.logoUrl} alt={match.team1.name} className={`w-10 h-10 rounded-full object-cover shrink-0 ${team1Won ? 'ring-2 ring-green-500' : 'opacity-50'}`} />
                                                ) : (
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${team1Won ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-gray-500'}`}>
                                                        {match.team1?.name?.substring(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Score */}
                                            <div className="px-4 text-center min-w-[80px]">
                                                <span className="font-mono font-bold text-xl">
                                                    <span className={team1Won ? 'text-green-400' : 'text-gray-500'}>{match.score1}</span>
                                                    <span className="text-gray-600 mx-1">-</span>
                                                    <span className={team2Won ? 'text-green-400' : 'text-gray-500'}>{match.score2}</span>
                                                </span>
                                            </div>

                                            {/* Team 2 */}
                                            <div className={`flex items-center gap-3 sm:flex-1 w-full sm:w-auto justify-center ${team2Won ? 'text-green-400' : 'text-gray-400'}`}>
                                                {match.team2?.logoUrl ? (
                                                    <img src={match.team2.logoUrl} alt={match.team2.name} className={`w-10 h-10 rounded-full object-cover shrink-0 ${team2Won ? 'ring-2 ring-green-500' : 'opacity-50'}`} />
                                                ) : (
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${team2Won ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-gray-500'}`}>
                                                        {match.team2?.name?.substring(0, 2).toUpperCase() || '—'}
                                                    </div>
                                                )}
                                                <span className={`font-bold truncate ${team2Won ? '' : 'line-through opacity-50'}`}>{match.team2?.name || 'BYE'}</span>
                                            </div>
                                        </div>

                                        {/* Date — shown below on mobile */}
                                        {match.startTime && (
                                            <div className="text-sm text-gray-500 mt-2 flex items-center gap-2 justify-center sm:justify-start">
                                                <Clock className="w-4 h-4" />
                                                {formatDate(match.startTime)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>

            {/* Toast */}
            <Toast
                message={toast.message}
                type={toast.type}
                isVisible={toast.visible}
                onClose={() => setToast(prev => ({ ...prev, visible: false }))}
            />

            {/* Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.open}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmLabel="Delete"
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, open: false }))}
            />
        </div>
    );
}
