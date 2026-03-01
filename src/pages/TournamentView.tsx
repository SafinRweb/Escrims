import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Save, Trophy, Trash2, Download, Edit2, X, Users, Tv, Calendar, Flame, Target, Swords, TrendingUp, BarChart3 } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import TournamentBracketViewer from '../components/tournament/TournamentBracketViewer';
import ManageMatchesAdmin from '../components/tournament/ManageMatchesAdmin';
import type { Tournament, Match, Team } from '../lib/tournamentLogic';
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
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

    const exportRef = useRef<HTMLDivElement>(null);

    // Team editing state
    const [editingTeams, setEditingTeams] = useState(false);
    const [editTeamData, setEditTeamData] = useState<{ id: string; name: string; logoUrl: string }[]>([]);

    // Tournament info editing state
    const [editingInfo, setEditingInfo] = useState(false);
    const [editDescription, setEditDescription] = useState('');
    const [editSponsor, setEditSponsor] = useState('');
    const [editImageUrl, setEditImageUrl] = useState('');
    const [editStreamLink, setEditStreamLink] = useState('');
    const [editingStream, setEditingStream] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [showAllUpcoming, setShowAllUpcoming] = useState(false);
    const [showAllCompleted, setShowAllCompleted] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [uploadingTeamId, setUploadingTeamId] = useState<string | null>(null);

    // Toast state
    const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
        message: '', type: 'info', visible: false
    });
    const showToast = (message: string, type: ToastType) => setToast({ message, type, visible: true });

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
        open: false, title: '', message: '', onConfirm: () => { }
    });

    // Tab Navigation State
    const [activeTab, setActiveTab] = useState<'overview' | 'standings' | 'bracket' | 'matches' | 'manage'>('overview');
    const [bracketRefreshKey, setBracketRefreshKey] = useState(0);

    const fetchTournament = async () => {
        if (!id) return;
        try {
            const docRef = doc(db, "tournaments", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const tournamentData = docSnap.data() as Tournament;

                try {
                    const matchesRef = collection(db, "tournaments", id, "matches");
                    const matchesSnap = await getDocs(matchesRef);
                    const subMatches: Match[] = [];
                    matchesSnap.forEach((doc) => {
                        subMatches.push(doc.data() as Match);
                    });

                    if (subMatches.length > 0) {
                        tournamentData.matches = subMatches;
                    }
                } catch (e) {
                    console.error("Error fetching subcollection matches:", e);
                }

                setTournament(tournamentData);
                setBracketRefreshKey(prev => prev + 1);
            } else {
                console.log("No such tournament!");
            }
        } catch (error) {
            console.error("Error fetching tournament:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
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

    // Smart save: if scores are 0-0 → only update schedule; if scores are set → submit result
    const saveMatch = async () => {
        if (!tournament || !id || !editingMatchId) return;

        const hasScore = editScore1 !== 0 || editScore2 !== 0;

        // Validate date/time if provided
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

            if (isNaN(new Date(editTime).getTime())) {
                showToast("Invalid date. Please enter a valid date.", "error");
                return;
            }

            if (new Date(editTime) < new Date()) {
                showToast("Warning: The match date you entered is in the past.", "warning");
            }
        }

        // If scores are set, validate no tie
        if (hasScore && editScore1 === editScore2) {
            showToast("Scores cannot be tied — there must be a winner.", "error");
            return;
        }

        // If no score AND no time change, nothing to save
        if (!hasScore && !editTime) {
            showToast("Please set a date/time or enter scores.", "error");
            return;
        }

        try {
            const updatedMatches = tournament.matches.map(m => {
                if (m.id !== editingMatchId) return m;

                // Scores are 0-0: only update schedule, keep match upcoming
                if (!hasScore) {
                    return { ...m, startTime: editTime || m.startTime };
                }

                // Scores are set: determine winner, mark completed
                let winnerId: string | null = null;
                if (m.team1 && m.team2) {
                    winnerId = editScore1 > editScore2 ? m.team1.id : m.team2.id;
                }

                return {
                    ...m,
                    score1: editScore1,
                    score2: editScore2,
                    startTime: editTime || m.startTime,
                    winnerId
                };
            });

            const matchToUpdate = updatedMatches.find(m => m.id === editingMatchId);

            if (matchToUpdate) {
                if ((tournament as any).bracketConfig) {
                    const matchRef = doc(db, "tournaments", id, "matches", editingMatchId);
                    await updateDoc(matchRef, { ...matchToUpdate });
                } else {
                    const docRef = doc(db, "tournaments", id);
                    await updateDoc(docRef, { matches: updatedMatches });
                }
            }

            setTournament({ ...tournament, matches: updatedMatches });
            setEditingMatchId(null);
            showToast(hasScore ? "Match result submitted! Match marked as completed." : "Match schedule updated!", "success");
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
        setEditSponsor((tournament as any).sponsor || '');
        setEditImageUrl((tournament as any).imageUrl || '');
        setEditingInfo(true);
    };

    const saveInfoEdits = async () => {
        if (!tournament || !id) return;
        try {
            const docRef = doc(db, "tournaments", id);
            await updateDoc(docRef, {
                description: editDescription,
                sponsor: editSponsor,
                imageUrl: editImageUrl,
            });
            setTournament({ ...tournament, description: editDescription, sponsor: editSponsor, imageUrl: editImageUrl } as any);
            setEditingInfo(false);
            showToast("Tournament info updated!", "success");
        } catch (error) {
            console.error("Error updating info:", error);
            showToast("Failed to update tournament info.", "error");
        }
    };

    const saveStreamEdit = async () => {
        if (!tournament || !id) return;
        try {
            const docRef = doc(db, "tournaments", id);
            await updateDoc(docRef, { streamLink: editStreamLink });
            setTournament({ ...tournament, streamLink: editStreamLink } as any);
            setEditingStream(false);
            showToast("Stream link updated!", "success");
        } catch (error) {
            console.error("Error updating stream link:", error);
            showToast("Failed to update stream link.", "error");
        }
    };

    const handleTournamentLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setEditImageUrl('');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast("File is too large. Please select an image under 2MB.", "error");
            e.target.value = ''; // Clear the input
            return;
        }

        setIsUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `images/tournament-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const storageRef = ref(storage, fileName);

            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);
            setEditImageUrl(downloadUrl);
            showToast("Tournament logo uploaded!", "success");
        } catch (error: any) {
            if (error.name === 'AbortError') {
                showToast("Upload cancelled.", "info");
            } else {
                console.error("Error uploading logo:", error);
                showToast("Failed to upload logo. Try again.", "error");
            }
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const cancelTournamentLogoUpload = () => {
        setIsUploadingLogo(false);
        showToast("Upload cancelled.", "info");
        // Using uncontrolled inputs, the best way to clear without ref is via user interaction, but we can reset the URL state if desired.
    };

    const handleTeamLogoUpload = async (index: number, teamId: string, teamName: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            // Unset the image URL if they cleared the field
            const newTeamData = [...editTeamData];
            newTeamData[index] = { ...newTeamData[index], logoUrl: '' };
            setEditTeamData(newTeamData);
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast("File is too large. Please select an image under 2MB.", "error");
            e.target.value = ''; // Clear the input
            return;
        }

        const safeName = (teamName || teamId).replace(/[^a-z0-9]/gi, '_').toLowerCase();

        setUploadingTeamId(teamId);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `images/team-${safeName}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const storageRef = ref(storage, fileName);

            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            const newTeamData = [...editTeamData];
            newTeamData[index] = { ...newTeamData[index], logoUrl: downloadUrl };
            setEditTeamData(newTeamData);

            showToast(`Team logo uploaded for ${teamName || 'Team'}!`, "success");
        } catch (error: any) {
            if (error.name === 'AbortError') {
                showToast("Upload cancelled.", "info");
            } else {
                console.error("Error uploading team logo:", error);
                showToast(`Failed to upload logo for ${teamName || 'Team'}.`, "error");
            }
        } finally {
            setUploadingTeamId(null);
        }
    };

    const cancelTeamLogoUpload = () => {
        setUploadingTeamId(null);
        showToast("Upload cancelled.", "info");
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

    const handleExport = async () => {
        showToast("Exporting Standings is coming soon!", "info");
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-transparent text-white flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
                </div>
            </div>
        );
    }

    if (!tournament) {
        return (
            <div className="min-h-screen bg-transparent text-white flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <p>Tournament not found.</p>
                </div>
            </div>
        );
    }

    // Split matches into upcoming and completed
    const isByeMatch = (m: Match) => {
        const t1 = m.team1?.name?.trim().toUpperCase();
        const t2 = m.team2?.name?.trim().toUpperCase();
        const t1IsSeed = m.team1?.id?.startsWith('seed-');
        const t2IsSeed = m.team2?.id?.startsWith('seed-');
        return t1 === 'BYE' || t2 === 'BYE' || t1IsSeed || t2IsSeed;
    };

    const hasGroupStage = tournament.bracketConfig?.hasGroupStage ?? true;
    const groupStageMatches = tournament.matches.filter(m => m.stage === 'group');
    const groupStageFinished = groupStageMatches.length > 0 && groupStageMatches.every(m => m.winnerId);
    const showOnlyGroupInList = hasGroupStage && !groupStageFinished;

    const listMatches = showOnlyGroupInList
        ? tournament.matches.filter(m => m.stage === 'group')
        : tournament.matches;

    const upcomingMatches = listMatches.filter(m => !m.winnerId && !isByeMatch(m));
    const completedMatches = listMatches.filter(m => m.winnerId);

    // Filter group stage matches for standings
    let groupMatches = completedMatches;
    if (tournament.bracketConfig) {
        groupMatches = completedMatches.filter(m => m.stage === 'group');
    }

    // Compute team stats: mp (matches played), w (wins), l (losses), diff (differential), pts (points)
    const teamStats: Record<string, { mp: number; w: number; l: number; diff: number; pts: number }> = {};
    tournament.teams.forEach((t: any) => {
        const teamId = typeof t === 'string' ? t : t.id;
        teamStats[teamId] = { mp: 0, w: 0, l: 0, diff: 0, pts: 0 };
    });

    groupMatches.forEach(m => {
        if (m.team1 && m.team2 && m.winnerId) {
            const t1 = m.team1.id;
            const t2 = m.team2.id;

            if (teamStats[t1] && teamStats[t2]) {
                teamStats[t1].mp++;
                teamStats[t2].mp++;

                const s1 = m.score1 || 0;
                const s2 = m.score2 || 0;

                teamStats[t1].diff += (s1 - s2);
                teamStats[t2].diff += (s2 - s1);

                if (m.winnerId === t1) {
                    teamStats[t1].w++;
                    teamStats[t1].pts += 3;
                    teamStats[t2].l++;
                } else if (m.winnerId === t2) {
                    teamStats[t2].w++;
                    teamStats[t2].pts += 3;
                    teamStats[t1].l++;
                }
            }
        }
    });

    // Helper for tie-breaker
    const getHeadToHeadWinner = (tA: string, tB: string) => {
        const h2h = groupMatches.find(m =>
            (m.team1?.id === tA && m.team2?.id === tB) ||
            (m.team1?.id === tB && m.team2?.id === tA)
        );
        return h2h?.winnerId;
    };

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

    // Determine available tabs based on configuration
    const hasBracketTab = !!tournament.bracketConfig;
    const hasStandingsTab = tournament.bracketConfig ? tournament.bracketConfig.hasGroupStage : true; // True for old tournaments

    return (
        <div className="min-h-screen bg-transparent text-white flex flex-col font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-24">

                {/* Header */}
                <div className="flex flex-col md:flex-row gap-8 mb-8 animate-fade-in">
                    {/* Logo */}
                    <div className="w-32 h-32 md:w-48 md:h-48 bg-white/5 rounded-2xl flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                        {(tournament as any).imageUrl ? (
                            <img src={(tournament as any).imageUrl} alt={tournament.name} className="w-full h-full object-cover" />
                        ) : (<Trophy className="w-16 h-16 text-gray-600" />
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1" >
                        <h1 className="text-2xl md:text-3xl font-bold tracking-wide mb-4 text-white">
                            {tournament.name}
                        </h1>
                        <div className="mb-6 max-w-2xl">
                            <div className={`text-gray-400 text-lg leading-relaxed ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}>
                                {(tournament as any).description || "No description provided."}
                            </div>
                            {((tournament as any).description || '').length > 150 && (
                                <button
                                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                    className="text-accent text-sm font-bold mt-2 hover:underline"
                                >
                                    {isDescriptionExpanded ? 'Read Less' : 'Read More'}
                                </button>
                            )}

                            {/* Sponsor Block */}
                            {(tournament as any).sponsor && (
                                <p className="text-gray-500 text-md mt-4 font-bold italic">
                                    Sponsored by <span className="text-accent">{(tournament as any).sponsor}</span>
                                </p>
                            )}
                        </div>

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
                        </div>

                    </div>

                    {/* Actions — only for owner/admin */}
                    {
                        canManage && (
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
                        )
                    }
                </div>

                {/* ============ EDIT TOURNAMENT INFO PANEL ============ */}
                {
                    editingInfo && (
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
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Sponsor Name (Optional)</label>
                                    <input
                                        type="text"
                                        value={editSponsor}
                                        onChange={(e) => setEditSponsor(e.target.value)}
                                        className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
                                        placeholder="e.g. Nexus Gaming"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Tournament Logo</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleTournamentLogoUpload}
                                            disabled={isUploadingLogo}
                                            className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-accent file:text-black hover:file:bg-accent/90 cursor-pointer disabled:opacity-50"
                                        />
                                        {isUploadingLogo && (
                                            <div className="mt-2 flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2">
                                                <span className="text-xs text-accent animate-pulse">Uploading logo...</span>
                                                <button onClick={cancelTournamentLogoUpload} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                                            </div>
                                        )}
                                        {editImageUrl && !isUploadingLogo && (
                                            <div className="mt-2 flex items-center justify-between">
                                                <span className="text-xs text-green-400">✓ Logo ready to save</span>
                                                <button onClick={() => setEditImageUrl('')} className="text-xs text-red-400 hover:text-red-300 w-fit bg-red-500/10 px-2 py-1 rounded border border-red-500/20 transition">Remove Logo</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-4">
                                <button onClick={() => setEditingInfo(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
                                <button onClick={saveInfoEdits} disabled={isUploadingLogo} className="bg-accent text-black font-bold px-6 py-2 rounded-lg hover:bg-accent/90 flex items-center gap-2 text-sm disabled:opacity-50">
                                    <Save className="w-4 h-4" /> Save Changes
                                </button>
                            </div>
                        </div>
                    )
                }

                {/* ============ TOURNAMENT WINNER BANNER ============ */}
                {(() => {
                    // Determine the tournament winner
                    let winnerTeam: { name: string; logoUrl?: string } | null = null;

                    if (tournament.bracketConfig) {
                        // Bracket tournament: find the grand final match
                        const playoffMatches = tournament.matches.filter(m => m.stage === 'playoff');
                        const loserTargetIds = new Set(playoffMatches.map(m => m.loserMatchId).filter(Boolean));
                        const finalMatch = playoffMatches.find(m =>
                            !m.nextMatchId && !loserTargetIds.has(m.id)
                        );
                        if (finalMatch?.winnerId) {
                            const winnerObj = finalMatch.winnerId === finalMatch.team1?.id ? finalMatch.team1 : finalMatch.team2;
                            if (winnerObj) winnerTeam = winnerObj;
                        }
                    } else {
                        // Legacy tournament: all matches completed → top-ranked team wins
                        const allDone = tournament.matches.length > 0 && tournament.matches.every(m => m.winnerId);
                        if (allDone) {
                            const ranked = tournament.teams
                                .map((team: any) => {
                                    const teamId = typeof team === 'string' ? team : team.id;
                                    const stats = teamStats[teamId] || { pts: 0, diff: 0 };
                                    return { team, teamId, ...stats };
                                })
                                .sort((a, b) => {
                                    if (b.pts !== a.pts) return b.pts - a.pts;
                                    if (b.diff !== a.diff) return b.diff - a.diff;
                                    const h2h = getHeadToHeadWinner(a.teamId, b.teamId);
                                    if (h2h === a.teamId) return -1;
                                    if (h2h === b.teamId) return 1;
                                    return 0;
                                });
                            if (ranked.length > 0) {
                                const top = ranked[0].team;
                                winnerTeam = {
                                    name: typeof top === 'string' ? top : top.name,
                                    logoUrl: typeof top === 'string' ? undefined : top.logoUrl,
                                };
                            }
                        }
                    }

                    if (!winnerTeam) return null;

                    // ALWAYS look up the team in the main tournament.teams array to get the latest logoUrl/metadata
                    const finalWinnerId = (winnerTeam as any).id;
                    const officialTeam = tournament.teams.find((t: any) => (typeof t === 'string' ? t : t.id) === finalWinnerId);

                    if (officialTeam) {
                        winnerTeam = {
                            name: typeof officialTeam === 'string' ? officialTeam : officialTeam.name,
                            logoUrl: typeof officialTeam === 'string' ? undefined : officialTeam.logoUrl
                        };
                    }

                    return (
                        <div className="mb-8 animate-fade-in">
                            <div className="relative overflow-hidden bg-gradient-to-r from-yellow-900/30 via-yellow-600/20 to-yellow-900/30 border border-accent/40 rounded-2xl p-6 md:p-8 shadow-[0_0_40px_rgba(255,215,0,0.15)]">
                                {/* Decorative glow */}
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

                                <div className="relative flex flex-col items-center text-center gap-4">
                                    <div className="bg-accent/20 p-3 rounded-full border border-accent/30">
                                        <Trophy className="w-10 h-10 text-accent" />
                                    </div>

                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent/70 mb-2">Tournament Champion</p>
                                        <div className="flex items-center justify-center gap-4">
                                            {winnerTeam.logoUrl ? (
                                                <img src={winnerTeam.logoUrl} alt={winnerTeam.name} className="w-14 h-14 rounded-full object-cover ring-2 ring-accent shadow-[0_0_20px_rgba(255,215,0,0.3)]" />
                                            ) : (
                                                <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center text-xl font-bold text-accent ring-2 ring-accent/50">
                                                    {winnerTeam.name?.substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <h2 className="text-2xl md:text-4xl font-display font-bold uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-accent to-yellow-500">
                                                {winnerTeam.name}
                                            </h2>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ============ TAB NAVIGATION ============ */}
                <div className="flex overflow-x-auto custom-scrollbar border-b border-white/10 mb-8 pb-px">
                    <div className="flex gap-8 px-2 min-w-max">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`pb-4 font-bold text-sm tracking-wide transition-colors relative whitespace-nowrap ${activeTab === 'overview' ? 'text-accent' : 'text-gray-400 hover:text-white'}`}
                        >
                            Overview
                            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                        </button>

                        {hasStandingsTab && (
                            <button
                                onClick={() => setActiveTab('standings')}
                                className={`pb-4 font-bold text-sm tracking-wide transition-colors relative whitespace-nowrap ${activeTab === 'standings' ? 'text-accent' : 'text-gray-400 hover:text-white'}`}
                            >
                                {tournament.bracketConfig ? 'Groups / Standings' : 'Standings'}
                                {activeTab === 'standings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                            </button>
                        )}

                        {hasBracketTab && (
                            <button
                                onClick={() => setActiveTab('bracket')}
                                className={`pb-4 font-bold text-sm tracking-wide transition-colors relative whitespace-nowrap ${activeTab === 'bracket' ? 'text-accent' : 'text-gray-400 hover:text-white'}`}
                            >
                                Playoff Bracket
                                {activeTab === 'bracket' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                            </button>
                        )}

                        <button
                            onClick={() => setActiveTab('matches')}
                            className={`pb-4 font-bold text-sm tracking-wide transition-colors relative whitespace-nowrap ${activeTab === 'matches' ? 'text-accent' : 'text-gray-400 hover:text-white'}`}
                        >
                            Matches List
                            {activeTab === 'matches' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                        </button>
                        {canManage && !!tournament.bracketConfig && (
                            <button
                                onClick={() => setActiveTab('manage')}
                                className={`pb-4 font-bold text-sm tracking-wide transition-colors relative whitespace-nowrap ${activeTab === 'manage' ? 'text-accent' : 'text-gray-400 hover:text-white'}`}
                            >
                                Manage Bracket
                                {activeTab === 'manage' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                            </button>
                        )}
                    </div>
                </div>

                {/* ============ OVERVIEW TAB ============ */}
                {
                    activeTab === 'overview' && (
                        <div className="space-y-12 animate-fade-in">
                            {/* LIVE STREAM PLAYER — only show if stream link exists or user can manage */}
                            {((tournament as any).streamLink || canManage) && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-2xl font-bold font-display uppercase text-gray-300 flex items-center gap-3">
                                            <Tv className="w-6 h-6 text-purple-500" /> Live Stream
                                        </h3>
                                        {canManage && !editingStream && (
                                            <button onClick={() => { setEditStreamLink((tournament as any).streamLink || ''); setEditingStream(true); }} className="text-sm text-gray-400 hover:text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10 transition">
                                                <Edit2 className="w-4 h-4" /> Edit Stream
                                            </button>
                                        )}
                                    </div>

                                    {editingStream && (
                                        <div className="bg-neutral-900/80 border border-purple-500/30 rounded-2xl p-6 mb-6 animate-fade-in">
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-lg font-bold flex items-center gap-2"><Tv className="w-5 h-5 text-purple-500" /> Edit Live Stream</h4>
                                                <button onClick={() => setEditingStream(false)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">YouTube Livestream Link</label>
                                                <input
                                                    type="text"
                                                    value={editStreamLink}
                                                    onChange={(e) => setEditStreamLink(e.target.value)}
                                                    className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                                    placeholder="https://youtube.com/live/..."
                                                />
                                            </div>
                                            <div className="flex justify-end gap-3 mt-4">
                                                <button onClick={() => setEditingStream(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
                                                <button onClick={saveStreamEdit} className="bg-purple-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-purple-500 flex items-center gap-2 text-sm">
                                                    <Save className="w-4 h-4" /> Save Link
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!editingStream && (tournament as any).streamLink && (
                                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden aspect-video shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                                            {(() => {
                                                const link = (tournament as any).streamLink;
                                                let embedUrl = link;

                                                // Basic YouTube URL parsing
                                                if (link.includes('youtube.com/watch?v=')) {
                                                    const videoId = new URL(link).searchParams.get('v');
                                                    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
                                                } else if (link.includes('youtu.be/')) {
                                                    const videoId = link.split('youtu.be/')[1]?.split('?')[0];
                                                    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
                                                } else if (link.includes('youtube.com/live/')) {
                                                    const videoId = link.split('youtube.com/live/')[1]?.split('?')[0];
                                                    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
                                                }

                                                return (
                                                    <iframe
                                                        className="w-full h-full"
                                                        src={embedUrl}
                                                        title={`${tournament.name} Live Stream`}
                                                        frameBorder="0"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                        allowFullScreen
                                                    ></iframe>
                                                );
                                            })()}
                                        </div>
                                    )}
                                    {!((tournament as any).streamLink) && !editingStream && canManage && (
                                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-12 text-center text-gray-500 border-dashed">
                                            No live stream configured yet. Click "Edit Stream" to add one.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ============ TOURNAMENT STATS BENTO GRID ============ */}
                            {(() => {
                                // Only show if there are completed matches
                                if (completedMatches.length === 0) return null;

                                // 1. Most Wins
                                let mostWinsTeam = { name: '—', count: 0 };
                                Object.entries(teamStats).forEach(([tid, stats]) => {
                                    if (stats.w > mostWinsTeam.count) {
                                        const team = tournament.teams.find((t: any) => (typeof t === 'string' ? t : t.id) === tid);
                                        mostWinsTeam = { name: team ? (typeof team === 'string' ? team : team.name) : tid, count: stats.w };
                                    }
                                });

                                // 2. Winning Streak
                                const streaks: Record<string, number> = {};
                                const sortedCompleted = [...completedMatches].sort((a, b) => {
                                    if (a.startTime && b.startTime) return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                                    return 0;
                                });
                                const currentStreaks: Record<string, number> = {};
                                sortedCompleted.forEach(m => {
                                    if (!m.winnerId) return;
                                    currentStreaks[m.winnerId] = (currentStreaks[m.winnerId] || 0) + 1;
                                    // Reset loser streak
                                    const loserId = m.team1?.id === m.winnerId ? m.team2?.id : m.team1?.id;
                                    if (loserId) currentStreaks[loserId] = 0;
                                    // Track max
                                    if (!streaks[m.winnerId] || currentStreaks[m.winnerId] > streaks[m.winnerId]) {
                                        streaks[m.winnerId] = currentStreaks[m.winnerId];
                                    }
                                });
                                let streakTeam = { name: '—', count: 0 };
                                // Use current streaks for "active" winning streak
                                Object.entries(currentStreaks).forEach(([tid, count]) => {
                                    if (count > streakTeam.count) {
                                        const team = tournament.teams.find((t: any) => (typeof t === 'string' ? t : t.id) === tid);
                                        streakTeam = { name: team ? (typeof team === 'string' ? team : team.name) : tid, count };
                                    }
                                });

                                // 3. Highest Score in a single match
                                let highestScore = { teamName: '—', score: 0 };
                                completedMatches.forEach(m => {
                                    const s1 = m.score1 || 0;
                                    const s2 = m.score2 || 0;
                                    if (s1 > highestScore.score && m.team1) {
                                        highestScore = { teamName: m.team1.name, score: s1 };
                                    }
                                    if (s2 > highestScore.score && m.team2) {
                                        highestScore = { teamName: m.team2.name, score: s2 };
                                    }
                                });

                                // 4. Best Differential
                                let bestDiff = { name: '—', diff: -Infinity };
                                Object.entries(teamStats).forEach(([tid, stats]) => {
                                    if (stats.diff > bestDiff.diff) {
                                        const team = tournament.teams.find((t: any) => (typeof t === 'string' ? t : t.id) === tid);
                                        bestDiff = { name: team ? (typeof team === 'string' ? team : team.name) : tid, diff: stats.diff };
                                    }
                                });

                                // 5. Next Match
                                const nextMatch = upcomingMatches.find(m => m.startTime);
                                const nextMatchDisplay = nextMatch
                                    ? { teams: `${nextMatch.team1?.name || 'TBD'} vs ${nextMatch.team2?.name || 'TBD'}`, date: formatDate(nextMatch.startTime) }
                                    : null;

                                return (
                                    <div className="animate-fade-in">
                                        <h3 className="text-2xl font-bold font-display uppercase text-gray-300 flex items-center gap-3 mb-6">
                                            <BarChart3 className="w-6 h-6 text-accent" /> Tournament Highlights
                                        </h3>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                            {/* Winning Streak */}
                                            <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20 rounded-2xl p-5 flex flex-col gap-2 group hover:border-orange-500/40 transition-all">
                                                <div className="flex items-center gap-2 text-orange-400">
                                                    <Flame className="w-5 h-5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Winning Streak</span>
                                                </div>
                                                <div className="text-3xl font-bold text-white">{streakTeam.count}W</div>
                                                <div className="text-sm text-gray-400 truncate">{streakTeam.name}</div>
                                            </div>

                                            {/* Most Wins */}
                                            <div className="bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 rounded-2xl p-5 flex flex-col gap-2 group hover:border-accent/40 transition-all">
                                                <div className="flex items-center gap-2 text-accent">
                                                    <Trophy className="w-5 h-5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Most Wins</span>
                                                </div>
                                                <div className="text-3xl font-bold text-white">{mostWinsTeam.count}</div>
                                                <div className="text-sm text-gray-400 truncate">{mostWinsTeam.name}</div>
                                            </div>

                                            {/* Matches Played */}
                                            <div className="bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-2xl p-5 flex flex-col gap-2 group hover:border-blue-500/40 transition-all">
                                                <div className="flex items-center gap-2 text-blue-400">
                                                    <Swords className="w-5 h-5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Matches Played</span>
                                                </div>
                                                <div className="text-3xl font-bold text-white">{completedMatches.length}</div>
                                                <div className="text-sm text-gray-400">{upcomingMatches.length} remaining</div>
                                            </div>

                                            {/* Highest Score */}
                                            <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-2xl p-5 flex flex-col gap-2 group hover:border-purple-500/40 transition-all">
                                                <div className="flex items-center gap-2 text-purple-400">
                                                    <Target className="w-5 h-5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Highest Score</span>
                                                </div>
                                                <div className="text-3xl font-bold text-white">{highestScore.score}</div>
                                                <div className="text-sm text-gray-400 truncate">{highestScore.teamName}</div>
                                            </div>

                                            {/* Best Differential */}
                                            <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-2xl p-5 flex flex-col gap-2 group hover:border-emerald-500/40 transition-all">
                                                <div className="flex items-center gap-2 text-emerald-400">
                                                    <TrendingUp className="w-5 h-5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Best Differential</span>
                                                </div>
                                                <div className="text-3xl font-bold text-white">{bestDiff.diff > 0 ? '+' : ''}{bestDiff.diff === -Infinity ? '—' : bestDiff.diff}</div>
                                                <div className="text-sm text-gray-400 truncate">{bestDiff.diff === -Infinity ? '—' : bestDiff.name}</div>
                                            </div>

                                            {/* Next Match */}
                                            <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-2xl p-5 flex flex-col gap-2 group hover:border-cyan-500/40 transition-all">
                                                <div className="flex items-center gap-2 text-cyan-400">
                                                    <Calendar className="w-5 h-5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Next Match</span>
                                                </div>
                                                {nextMatchDisplay ? (
                                                    <>
                                                        <div className="text-lg font-bold text-white truncate">{nextMatchDisplay.teams}</div>
                                                        <div className="text-sm text-gray-400">{nextMatchDisplay.date}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="text-lg font-bold text-white">—</div>
                                                        <div className="text-sm text-gray-400">No upcoming matches</div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* FORMAT DETAILS — always visible to all users */}
                            {tournament.bracketConfig && (
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 animate-fade-in">
                                    <h3 className="text-xl font-bold font-display uppercase mb-4 text-gray-300">Format Details</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                        <div className="bg-black/30 rounded-xl p-4">
                                            <div className="text-gray-500 text-xs font-bold uppercase mb-1">Playoffs Format</div>
                                            <div className="text-white font-medium">{tournament.bracketConfig.format}</div>
                                        </div>
                                        {tournament.bracketConfig.hasGroupStage && (
                                            <div className="bg-black/30 rounded-xl p-4">
                                                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Group Stage</div>
                                                <div className="text-white font-medium">{tournament.bracketConfig.groupStageFormat}</div>
                                            </div>
                                        )}
                                        <div className="bg-black/30 rounded-xl p-4">
                                            <div className="text-gray-500 text-xs font-bold uppercase mb-1">Finals Series</div>
                                            <div className="text-white font-medium">{tournament.bracketConfig.grandFinalFormat || tournament.bracketConfig.upperBracketFormat}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                }

                {/* ============ STANDINGS TAB ============ */}
                {
                    activeTab === 'standings' && (
                        <div className="animate-fade-in space-y-6 mb-12">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <h3 className="text-2xl font-bold font-display uppercase text-gray-300 flex items-center gap-3">
                                    <Trophy className="w-6 h-6 text-accent" /> {tournament.bracketConfig ? 'Group Standings' : 'Standings'}
                                </h3>
                                {canManage && !editingTeams && (
                                    <button onClick={startEditTeams} className="text-sm text-gray-400 hover:text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10 transition border border-white/5 bg-white/5">
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
                                                <div className="w-full sm:w-48 relative">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => handleTeamLogoUpload(i, team.id, team.name, e)}
                                                        disabled={uploadingTeamId === team.id}
                                                        className="w-full bg-neutral-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent/50 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-white/10 file:text-white hover:file:bg-white/20 disabled:opacity-50 cursor-pointer"
                                                    />
                                                    {uploadingTeamId === team.id && (
                                                        <div className="absolute inset-0 bg-neutral-800/90 rounded-lg flex items-center justify-between px-3">
                                                            <span className="text-xs text-accent font-bold animate-pulse">Uploading...</span>
                                                            <button onClick={cancelTeamLogoUpload} className="text-xs text-red-400 hover:text-red-300 font-bold z-10 relative">✕</button>
                                                        </div>
                                                    )}
                                                </div>
                                                {team.logoUrl && (
                                                    <button onClick={() => { const d = [...editTeamData]; d[i] = { ...d[i], logoUrl: '' }; setEditTeamData(d); }} className="p-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition border border-red-500/20 mt-2 sm:mt-0" title="Remove logo">
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end gap-3 mt-4">
                                        <button onClick={() => setEditingTeams(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
                                        <button onClick={saveTeamEdits} disabled={uploadingTeamId !== null} className="bg-accent text-black font-bold px-6 py-2 rounded-lg hover:bg-accent/90 flex items-center gap-2 text-sm disabled:opacity-50">
                                            <Save className="w-4 h-4" /> Save Changes
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div id="export-container" ref={exportRef} style={{ position: 'relative' }}>
                                <div className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden">
                                    <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left">
                                            <thead className="bg-white/5 text-gray-400 uppercase text-xs font-bold">
                                                <tr>
                                                    <th className="px-3 md:px-6 py-4 w-12 whitespace-nowrap">#</th>
                                                    <th className="px-3 md:px-6 py-4 whitespace-nowrap">Team</th>
                                                    <th className="px-2 md:px-4 py-4 text-center whitespace-nowrap" title="Matches Played">MP</th>
                                                    <th className="px-2 md:px-4 py-4 text-center text-green-400 whitespace-nowrap" title="Wins">W</th>
                                                    <th className="px-2 md:px-4 py-4 text-center text-red-400 whitespace-nowrap" title="Losses">L</th>
                                                    <th className="px-2 md:px-4 py-4 text-center whitespace-nowrap" title="Differential">Diff</th>
                                                    <th className="px-2 md:px-4 py-4 text-right whitespace-nowrap">Pts</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {tournament.teams
                                                    .map((team: any, i: number) => {
                                                        const teamName = typeof team === 'string' ? team : team.name;
                                                        const teamId = typeof team === 'string' ? team : team.id;
                                                        const stats = teamStats[teamId] || { mp: 0, w: 0, l: 0, diff: 0, pts: 0 };
                                                        const logoUrl = typeof team === 'string' ? '' : (team.logoUrl || '');
                                                        return { teamName, teamId, ...stats, logoUrl, idx: i };
                                                    })
                                                    .sort((a, b) => {
                                                        if (b.pts !== a.pts) return b.pts - a.pts;
                                                        if (b.diff !== a.diff) return b.diff - a.diff;
                                                        const h2hWinner = getHeadToHeadWinner(a.teamId, b.teamId);
                                                        if (h2hWinner === a.teamId) return -1;
                                                        if (h2hWinner === b.teamId) return 1;
                                                        return 0;
                                                    })
                                                    .map((t, rank) => (
                                                        <tr key={t.idx} className="hover:bg-white/5 transition-colors">
                                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rank === 0 && t.pts > 0 ? 'bg-accent text-black' : 'bg-white/10 text-gray-400'}`}>
                                                                    {rank + 1}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
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
                                                            <td className="px-2 md:px-4 py-4 text-center whitespace-nowrap">
                                                                <span className="font-mono font-bold text-gray-300">{t.mp}</span>
                                                            </td>
                                                            <td className="px-2 md:px-4 py-4 text-center whitespace-nowrap">
                                                                <span className="font-mono font-bold text-green-400">{t.w}</span>
                                                            </td>
                                                            <td className="px-2 md:px-4 py-4 text-center whitespace-nowrap">
                                                                <span className="font-mono font-bold text-red-400">{t.l}</span>
                                                            </td>
                                                            <td className="px-2 md:px-4 py-4 text-center whitespace-nowrap">
                                                                <span className="font-mono font-bold text-gray-300">{t.diff > 0 ? `+${t.diff}` : t.diff}</span>
                                                            </td>
                                                            <td className="px-2 md:px-4 py-4 text-right whitespace-nowrap">
                                                                <span className="font-mono font-bold text-accent">{t.pts}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* ============ BRACKET TAB ============ */}
                {
                    activeTab === 'bracket' && tournament.bracketConfig && (
                        <div className="animate-fade-in space-y-6">
                            <h3 className="text-2xl font-bold font-display uppercase text-gray-300 flex items-center gap-3">
                                <Tv className="w-6 h-6 text-accent" /> Playoff Bracket
                            </h3>
                            {hasGroupStage && !groupStageFinished ? (
                                <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-12 text-center text-gray-400">
                                    <Trophy className="w-12 h-12 mx-auto mb-4 text-accent/50" />
                                    <p className="font-bold text-white mb-2">Group stage in progress</p>
                                    <p className="text-sm">Complete all group stage matches to unlock the playoff bracket.</p>
                                </div>
                            ) : (
                                <TournamentBracketViewer tournamentId={tournament.id} refreshKey={bracketRefreshKey} />
                            )}
                        </div>
                    )
                }

                {/* ============ MATCHES TAB ============ */}
                {
                    activeTab === 'matches' && (
                        <div className="animate-fade-in space-y-12 mb-12">
                            {/* UPCOMING MATCHES */}
                            <div>
                                <h3 className="text-2xl font-bold font-display uppercase mb-6 text-gray-300 flex items-center gap-3">
                                    <Clock className="w-6 h-6 text-yellow-500" /> Upcoming Matches
                                </h3>
                                {upcomingMatches.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-12 text-center text-gray-500">
                                        No upcoming matches.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {(showAllUpcoming ? upcomingMatches : upcomingMatches.slice(0, 5)).map((match, idx) => (
                                            <div key={match.id} className="bg-neutral-900/50 border border-white/10 rounded-xl p-5">
                                                {editingMatchId === match.id ? (
                                                    /* ---- EDIT MODE ---- */
                                                    <div className="space-y-4 relative">
                                                        <div className="flex flex-col lg:flex-row items-center gap-6 bg-black/40 p-4 rounded-xl border border-white/5">

                                                            {/* Team 1 Side */}
                                                            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-end flex-1 gap-4 w-full">
                                                                <span className="font-bold text-lg text-white truncate order-2 sm:order-1">{match.team1?.name}</span>
                                                                <div className="flex items-center gap-4 order-1 sm:order-2">
                                                                    <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                                        {match.team1?.name?.substring(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={editScore1}
                                                                        onChange={(e) => setEditScore1(parseInt(e.target.value) || 0)}
                                                                        className="w-16 bg-black border border-white/20 rounded-lg px-2 py-2 text-center font-mono font-bold text-white text-xl focus:border-accent outline-none"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Center: VS label */}
                                                            <div className="flex flex-col items-center gap-1 shrink-0">
                                                                <span className="text-gray-500 font-bold text-sm">VS</span>
                                                            </div>

                                                            {/* Team 2 Side */}
                                                            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start flex-1 gap-4 w-full">
                                                                <div className="flex items-center gap-4">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={editScore2}
                                                                        onChange={(e) => setEditScore2(parseInt(e.target.value) || 0)}
                                                                        className="w-16 bg-black border border-white/20 rounded-lg px-2 py-2 text-center font-mono font-bold text-white text-xl focus:border-accent outline-none"
                                                                    />
                                                                    <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                                        {match.team2?.name?.substring(0, 2).toUpperCase() || '—'}
                                                                    </div>
                                                                </div>
                                                                <span className="font-bold text-lg text-white truncate">{match.team2?.name || 'TBD'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Schedule + Actions */}
                                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-3">
                                                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                                                                <span className="text-gray-400 font-bold tracking-widest text-xs uppercase flex items-center gap-2 shrink-0">
                                                                    <Calendar className="w-3.5 h-3.5" /> Schedule
                                                                </span>
                                                                <input
                                                                    type="datetime-local"
                                                                    value={editTime}
                                                                    onChange={(e) => setEditTime(e.target.value)}
                                                                    className="bg-black border border-white/20 hover:border-white/40 focus:border-accent rounded-lg px-3 py-2 text-sm text-white min-w-[200px] outline-none transition w-full sm:w-auto"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                                                <button
                                                                    onClick={() => setEditingMatchId(null)}
                                                                    className="px-6 py-2 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition font-bold text-sm w-full sm:w-auto"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={saveMatch}
                                                                    className="bg-accent text-black font-bold px-8 py-2 rounded-lg hover:bg-accent/90 transition flex items-center justify-center gap-2 text-sm shadow-[0_0_15px_rgba(202,254,72,0.3)] w-full sm:w-auto"
                                                                >
                                                                    <Save className="w-4 h-4" /> Submit
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-2 text-center sm:text-left">
                                                            Leave scores at <strong className="text-white">0-0</strong> to only update the schedule. Enter scores to mark as <strong className="text-green-400">Completed</strong>.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    /* ---- VIEW MODE ---- */
                                                    <div>
                                                        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-gray-500 font-mono text-sm hidden sm:block w-8">#{idx + 1}</span>
                                                                {match.format && (
                                                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">
                                                                        {match.format}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Team 1 */}
                                                            <div className="flex items-center gap-3 sm:flex-1 sm:justify-end w-full sm:w-auto justify-center">
                                                                <span className={`font-bold sm:text-right truncate ${match.team1 ? 'text-white' : 'text-gray-500 italic'}`}>{match.team1?.name || 'TBD'}</span>
                                                                {match.team1?.logoUrl ? (
                                                                    <img src={match.team1.logoUrl} alt={match.team1.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                                                                ) : (
                                                                    <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                                        {match.team1?.name?.substring(0, 2).toUpperCase() || '?'}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Center column: Date & VS */}
                                                            <div className="px-4 text-center min-w-[100px] flex flex-col items-center justify-center">
                                                                {match.startTime && (
                                                                    <span className="text-xs text-gray-500 mb-1 font-mono tracking-widest hidden sm:block whitespace-nowrap">
                                                                        {formatDate(match.startTime)}
                                                                    </span>
                                                                )}
                                                                {match.startTime && isDatePassed(match.startTime) && !match.score1 && !match.score2 ? (
                                                                    <span className="text-yellow-500 font-bold text-sm">TBA</span>
                                                                ) : (
                                                                    <span className="text-accent font-bold text-[1.5rem] leading-none">VS</span>
                                                                )}
                                                                {match.startTime && (
                                                                    <span className="text-xs text-gray-500 mt-1 font-mono tracking-widest sm:hidden">
                                                                        {formatDate(match.startTime)}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Team 2 */}
                                                            <div className="flex items-center gap-3 sm:flex-1 w-full sm:w-auto justify-center sm:justify-start">
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
                                                                    <span className="text-gray-500 italic">TBD</span>
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

                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {upcomingMatches.length > 5 && (
                                            <button
                                                onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                                                className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-white transition"
                                            >
                                                {showAllUpcoming ? 'Show Less' : `Show More (${upcomingMatches.length - 5})`}
                                            </button>
                                        )}
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
                                        {(showAllCompleted ? completedMatches : completedMatches.slice(0, 5)).map((match, idx) => {
                                            const team1Won = match.winnerId === match.team1?.id;
                                            const team2Won = match.winnerId === match.team2?.id;
                                            return (
                                                <div key={match.id} className="bg-neutral-900/50 border border-white/10 rounded-xl p-5">
                                                    <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500 font-mono text-sm hidden sm:block w-8">#{idx + 1}</span>
                                                            {match.format && (
                                                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">
                                                                    {match.format}
                                                                </span>
                                                            )}
                                                        </div>

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

                                                        {/* Center Column: Date & Score */}
                                                        <div className="px-4 text-center min-w-[100px] flex flex-col items-center justify-center">
                                                            {match.startTime && (
                                                                <span className="text-xs text-gray-500 mb-1 font-mono tracking-widest hidden sm:block whitespace-nowrap opacity-70">
                                                                    {formatDate(match.startTime)}
                                                                </span>
                                                            )}
                                                            <div className="font-mono font-bold text-2xl leading-none">
                                                                <span className={team1Won ? 'text-green-400' : 'text-gray-500'}>{match.score1}</span>
                                                                <span className="text-gray-600 mx-2">-</span>
                                                                <span className={team2Won ? 'text-green-400' : 'text-gray-500'}>{match.score2}</span>
                                                            </div>
                                                            {match.startTime && (
                                                                <span className="text-xs text-gray-500 mt-1 font-mono tracking-widest sm:hidden opacity-70">
                                                                    {formatDate(match.startTime)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Team 2 */}
                                                        <div className={`flex items-center gap-3 sm:flex-1 w-full sm:w-auto justify-center sm:justify-start ${team2Won ? 'text-green-400' : 'text-gray-400'}`}>
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
                                        {completedMatches.length > 5 && (
                                            <button
                                                onClick={() => setShowAllCompleted(!showAllCompleted)}
                                                className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-white transition"
                                            >
                                                {showAllCompleted ? 'Show Less' : `Show More (${completedMatches.length - 5})`}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {/* ============ MANAGE TAB ============ */}
                {activeTab === 'manage' && canManage && tournament.bracketConfig && (
                    <div className="animate-fade-in space-y-6 mb-12 mt-4">
                        <ManageMatchesAdmin tournamentId={tournament.id} onMatchUpdate={fetchTournament} onToast={showToast} />
                    </div>
                )}
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
            </div >
        </div >
    );
}
