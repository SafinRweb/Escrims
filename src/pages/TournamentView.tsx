import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Save, Trophy, Trash2, Download, Edit2, X, Users, Tv } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import type { Tournament, Match, Team } from '../lib/tournamentLogic';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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
        if (!exportRef.current) return;
        try {
            showToast("Generating image...", "info");
            const dataUrl = await toPng(exportRef.current, {
                pixelRatio: 3,
                backgroundColor: '#0a0a0a',
            });
            const link = document.createElement('a');
            link.download = 'Escrims_Standings.png';
            link.href = dataUrl;
            link.click();
            showToast("Standings exported successfully!", "success");
        } catch (error: any) {
            console.error("Error exporting standings:", error);
            showToast("Failed to export standings: " + (error?.message || error), "error");
        }
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
        <div className="min-h-screen bg-transparent text-white flex flex-col font-sans">
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
                )}

                {/* ============ LIVE STREAM PLAYER ============ */}
                {((tournament as any).streamLink || canManage) && (
                    <div className="mb-12 animate-fade-in">
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

                                                {/* Center Side: Date & Time Picker */}
                                                <div className="flex flex-col items-center gap-2 shrink-0 w-full lg:w-auto bg-neutral-900 border border-white/10 px-6 py-4 rounded-xl shadow-lg relative z-10">
                                                    <span className="text-accent font-bold tracking-widest text-xs uppercase mb-1 flex items-center gap-2">
                                                        <Clock className="w-3 h-3" /> Setup Match
                                                    </span>
                                                    <input
                                                        type="datetime-local"
                                                        value={editTime}
                                                        onChange={(e) => setEditTime(e.target.value)}
                                                        className="bg-black border border-white/20 hover:border-white/40 focus:border-accent rounded-lg px-3 py-2 text-sm text-white min-w-[200px] outline-none transition"
                                                    />
                                                    <span className="text-gray-500 font-bold text-sm mt-1">VS</span>
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
                                                    <span className="font-bold text-lg text-white truncate">{match.team2?.name || 'BYE'}</span>
                                                </div>
                                            </div>

                                            {/* Action Control Strip */}
                                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                                                <p className="text-xs text-yellow-500/70 text-center sm:text-left">
                                                    ⚠️ Enter a score & save to mark as <strong className="text-white">Completed</strong>. Leave scores at <strong className="text-white">0-0</strong> to keep it upcoming.
                                                </p>
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
                                                        <Save className="w-4 h-4" /> Save
                                                    </button>
                                                </div>
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
