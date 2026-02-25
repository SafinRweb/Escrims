import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, ArrowRight, Shield, DollarSign, RefreshCw } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import { shuffleTeams, generateTournamentBracket } from '../lib/tournamentLogic';
import type { Team, Match } from '../lib/tournamentLogic';
import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import Toast from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';

export default function CreateTournament() {
    const [step, setStep] = useState(1);
    const [createdTournamentId, setCreatedTournamentId] = useState('');
    const [tournamentName, setTournamentName] = useState('');
    const [description, setDescription] = useState('');
    const [sponsor, setSponsor] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [prizePool, setPrizePool] = useState('');
    const [teamCount, setTeamCount] = useState<number>(16);
    const [teams, setTeams] = useState<{ name: string; logoUrl: string }[]>([]);
    const [shuffledTeams, setShuffledTeams] = useState<Team[]>([]);
    const [generatedMatches, setGeneratedMatches] = useState<Match[]>([]);
    const [bracketConfig, setBracketConfig] = useState<{
        format: 'Single Elimination' | 'Double Elimination';
        groupStageFormat: 'Bo1' | 'Bo2' | 'Bo3';
        upperBracketFormat: 'Bo3' | 'Bo5';
        lowerBracketFormat: 'Bo1' | 'Bo3' | 'Bo5';
        grandFinalFormat: 'Bo5' | 'Bo7';
    }>({
        format: 'Single Elimination',
        groupStageFormat: 'Bo1',
        upperBracketFormat: 'Bo3',
        lowerBracketFormat: 'Bo1',
        grandFinalFormat: 'Bo5'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [uploadingTeamIndex, setUploadingTeamIndex] = useState<number | null>(null);
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    // Toast state
    const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
        message: '', type: 'info', visible: false
    });
    const showToast = (message: string, type: ToastType) => setToast({ message, type, visible: true });

    const TEAM_COUNT_OPTIONS = [4, 8, 12, 16, 24, 32] as const;

    const handleTeamCountChange = (count: number) => {
        setTeamCount(count);
        setTeams(prev => {
            const newTeams = [...prev];
            if (newTeams.length < count) {
                return [...newTeams, ...Array(count - newTeams.length).fill({ name: '', logoUrl: '' })];
            } else {
                return newTeams.slice(0, count);
            }
        });
    };

    const handleTeamNameChange = (index: number, name: string) => {
        const newTeams = [...teams];
        newTeams[index] = { ...newTeams[index], name };
        setTeams(newTeams);
    };

    const handleTeamLogoChange = (index: number, logoUrl: string) => {
        const newTeams = [...teams];
        newTeams[index] = { ...newTeams[index], logoUrl };
        setTeams(newTeams);
    };

    const initializeTeams = () => {
        setTeams(Array(teamCount).fill({ name: '', logoUrl: '' }));
        setStep(2);
    };

    const handleTournamentLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

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

            // Create a cancellable promise
            const uploadPromise = uploadBytes(storageRef, file);

            await uploadPromise;

            const downloadUrl = await getDownloadURL(storageRef);
            setImageUrl(downloadUrl);
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
        // We reset the input field by using a ref or just letting the user re-select.
        // In React, controlled file inputs are tricky, so we rely on the user picking again.
    };

    const handleTeamLogoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast("File is too large. Please select an image under 2MB.", "error");
            e.target.value = ''; // Clear the input
            return;
        }

        const originalTeamName = teams[index].name || `team${index}`;
        const safeName = originalTeamName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        setUploadingTeamIndex(index);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `images/team-${safeName}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const storageRef = ref(storage, fileName);

            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);
            handleTeamLogoChange(index, downloadUrl);
            showToast(`Team logo uploaded for ${teams[index].name || 'Team ' + (index + 1)}!`, "success");
        } catch (error: any) {
            if (error.name === 'AbortError') {
                showToast("Upload cancelled.", "info");
            } else {
                console.error("Error uploading team logo:", error);
                showToast(`Failed to upload logo for ${teams[index].name || 'Team ' + (index + 1)}.`, "error");
            }
        } finally {
            setUploadingTeamIndex(null);
        }
    };

    const cancelTeamLogoUpload = () => {
        setUploadingTeamIndex(null);
        showToast("Upload cancelled.", "info");
    };

    // Step 2 → Step 3: Shuffle teams and generate bracket preview
    const handleGenerateBracket = () => {
        if (teams.some(t => !t.name.trim())) {
            showToast("Please fill in all team names before proceeding.", "warning");
            return;
        }
        const teamsData = teams.map(t => ({ name: t.name.trim(), logoUrl: t.logoUrl.trim() }));
        const shuffled = shuffleTeams(teamsData);
        const configWithGroupStage = { ...bracketConfig, hasGroupStage: true };
        const matches = generateTournamentBracket(shuffled, configWithGroupStage);
        setShuffledTeams(shuffled);
        setGeneratedMatches(matches);
        setStep(3);
    };

    // Reshuffle teams and regenerate matches
    const handleReshuffle = () => {
        const teamsData = teams.map(t => ({ name: t.name.trim(), logoUrl: t.logoUrl.trim() }));
        const shuffled = shuffleTeams(teamsData);
        const configWithGroupStage = { ...bracketConfig, hasGroupStage: true };
        const matches = generateTournamentBracket(shuffled, configWithGroupStage);
        setShuffledTeams(shuffled);
        setGeneratedMatches(matches);
        showToast("Teams reshuffled!", "success");
    };

    // Step 3 → Step 4: Submit for approval
    const handleSubmitForApproval = async () => {
        if (!currentUser) {
            showToast("You must be logged in to create a tournament.", "error");
            navigate('/login');
            return;
        }

        setIsSubmitting(true);

        try {
            const tournamentId = `tourney-${Date.now()}`;

            const newTournament: any = {
                id: tournamentId,
                organizerId: currentUser.uid,
                name: tournamentName,
                description,
                sponsor, // Added sponsor
                imageUrl,
                prizePool,
                prizePoolValue: parsePrizePool(prizePool),
                bracketConfig: { ...bracketConfig, hasGroupStage: true },
                teams: shuffledTeams,
                matches: [], // Clear top level array, matches now go to subcollection
                status: 'pending_approval',
                createdAt: serverTimestamp()
            };

            // 1. Create the main tournament document
            await setDoc(doc(db, "tournaments", tournamentId), newTournament);

            // 2. Batch write the generated matches into a subcollection to avoid 1MB document limits
            const batch = writeBatch(db);
            generatedMatches.forEach((match) => {
                const matchRef = doc(db, "tournaments", tournamentId, "matches", match.id);
                batch.set(matchRef, match);
            });
            await batch.commit();
            setCreatedTournamentId(tournamentId);
            setStep(4);
        } catch (error) {
            console.error("Error creating tournament:", error);
            showToast("Failed to create tournament. Please try again.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Parse prize pool string to a numeric value for sorting
    const parsePrizePool = (pool: string): number => {
        const cleaned = pool.replace(/[^0-9.]/g, '');
        return parseFloat(cleaned) || 0;
    };

    return (
        <div className="min-h-screen bg-transparent text-white">
            <Navbar />
            <div className="container mx-auto px-6 py-24">
                <div className="max-w-4xl mx-auto">
                    <header className="mb-12 text-center">
                        <h1 className="text-4xl font-bold mb-4">Create New Tournament</h1>
                        <p className="text-gray-400">Setup your bracket and teams</p>

                        {/* Progress Steps */}
                        <div className="flex items-center justify-center gap-3 mt-8">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-accent text-black' : 'bg-white/10'}`}>1</div>
                            <div className="w-12 h-1 bg-white/10"><div className={`h-full bg-accent transition-all ${step >= 2 ? 'w-full' : 'w-0'}`}></div></div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-accent text-black' : 'bg-white/10'}`}>2</div>
                            <div className="w-12 h-1 bg-white/10"><div className={`h-full bg-accent transition-all ${step >= 3 ? 'w-full' : 'w-0'}`}></div></div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${step >= 3 ? 'bg-accent text-black' : 'bg-white/10'}`}>3</div>
                            <div className="w-12 h-1 bg-white/10"><div className={`h-full bg-accent transition-all ${step >= 4 ? 'w-full' : 'w-0'}`}></div></div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${step >= 4 ? 'bg-green-500 text-black' : 'bg-white/10'}`}>✓</div>
                        </div>
                    </header>

                    {/* Step 1: Tournament Info */}
                    {step === 1 && (
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-sm animate-fade-in">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Tournament Name</label>
                                    <div className="relative">
                                        <Trophy className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                        <input
                                            type="text"
                                            value={tournamentName}
                                            onChange={(e) => setTournamentName(e.target.value)}
                                            className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                            placeholder="e.g. Winter Championship 2026"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all h-32 resize-none"
                                        placeholder="Describe your tournament..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Sponsor Name (Optional)</label>
                                    <div className="relative">
                                        <Trophy className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                        <input
                                            type="text"
                                            value={sponsor}
                                            onChange={(e) => setSponsor(e.target.value)}
                                            className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                            placeholder="e.g. Nexus Gaming"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Tournament Logo (Optional)</label>
                                        <div className="relative">
                                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleTournamentLogoUpload}
                                                disabled={isUploadingLogo}
                                                className="w-full bg-neutral-950 border border-white/10 text-sm text-gray-400 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-accent file:text-black hover:file:bg-accent/90 cursor-pointer disabled:opacity-50"
                                            />
                                        </div>
                                        {isUploadingLogo && (
                                            <div className="mt-2 flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2">
                                                <span className="text-xs text-accent animate-pulse">Uploading logo...</span>
                                                <button onClick={cancelTournamentLogoUpload} className="text-xs text-red-400 hover:text-red-300">Cancel</button>
                                            </div>
                                        )}
                                        {imageUrl && !isUploadingLogo && (
                                            <div className="mt-2 flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2">
                                                <div className="flex items-center gap-3">
                                                    <img src={imageUrl} alt="Tournament Logo" className="w-12 h-12 object-cover rounded-md border border-white/10" />
                                                    <span className="text-xs text-green-400">✓ Logo uploaded</span>
                                                </div>
                                                <button onClick={() => setImageUrl('')} className="text-xs text-red-400 hover:text-red-300 w-fit bg-red-500/10 px-2 py-1 rounded border border-red-500/20 transition">Remove Logo</button>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Prize Pool (Optional)</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                            <input
                                                type="text"
                                                value={prizePool}
                                                onChange={(e) => setPrizePool(e.target.value)}
                                                className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                                placeholder="e.g. ৳10,000 or $500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Number of Teams</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                        {TEAM_COUNT_OPTIONS.map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => handleTeamCountChange(n)}
                                                className={`rounded-xl border py-4 px-4 text-center font-bold text-lg transition-all focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-neutral-900 ${
                                                    teamCount === n
                                                        ? 'bg-accent border-accent text-black'
                                                        : 'bg-neutral-950 border-white/10 text-white hover:border-white/20'
                                                }`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ========================================== */}
                            {/* ADVANCED BRACKET CONFIGURATION SECTION   */}
                            {/* ========================================== */}
                            <div className="mt-8 pt-8 border-t border-white/10">
                                <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-accent uppercase tracking-widest font-display">
                                    Advanced Bracket Configuration
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Tournament Format</label>
                                        <select
                                            value={bracketConfig.format}
                                            onChange={(e) => setBracketConfig({ ...bracketConfig, format: e.target.value as any })}
                                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent appearance-none capitalize"
                                        >
                                            <option value="Single Elimination">Single Elimination</option>
                                            <option value="Double Elimination">Double Elimination</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Group Stage Format</label>
                                        <select
                                            value={bracketConfig.groupStageFormat}
                                            onChange={(e) => setBracketConfig({ ...bracketConfig, groupStageFormat: e.target.value as any })}
                                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent appearance-none"
                                        >
                                            <option value="Bo1">Best of 1</option>
                                            <option value="Bo2">Best of 2</option>
                                            <option value="Bo3">Best of 3</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">
                                            {bracketConfig.format === 'Double Elimination' ? 'Upper Bracket Format' : 'Knockout Format'}
                                        </label>
                                        <select
                                            value={bracketConfig.upperBracketFormat}
                                            onChange={(e) => setBracketConfig({ ...bracketConfig, upperBracketFormat: e.target.value as any })}
                                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent appearance-none"
                                        >
                                            <option value="Bo3">Best of 3</option>
                                            <option value="Bo5">Best of 5</option>
                                        </select>
                                    </div>
                                    {bracketConfig.format === 'Double Elimination' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Lower Bracket Format</label>
                                            <select
                                                value={bracketConfig.lowerBracketFormat}
                                                onChange={(e) => setBracketConfig({ ...bracketConfig, lowerBracketFormat: e.target.value as any })}
                                                className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent appearance-none"
                                            >
                                                <option value="Bo1">Best of 1</option>
                                                <option value="Bo3">Best of 3</option>
                                                <option value="Bo5">Best of 5</option>
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Grand Final Format</label>
                                        <select
                                            value={bracketConfig.grandFinalFormat}
                                            onChange={(e) => setBracketConfig({ ...bracketConfig, grandFinalFormat: e.target.value as any })}
                                            className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent appearance-none"
                                        >
                                            <option value="Bo5">Best of 5</option>
                                            <option value="Bo7">Best of 7</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            {/* ========================================== */}

                            <div className="flex justify-end mt-8">
                                <button
                                    onClick={initializeTeams}
                                    disabled={!tournamentName || isUploadingLogo}
                                    className="bg-accent text-black font-bold px-8 py-3 rounded-xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                                >
                                    Enter Team Names <ArrowRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Team Names + Logos */}
                    {step === 2 && (
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm animate-fade-in">
                            <h3 className="text-2xl font-bold mb-2">Enter Team Details</h3>
                            <p className="text-gray-400 text-sm mb-6">Logo URL is optional — teams without logos will show initials.</p>
                            <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                                {teams.map((team, index) => (
                                    <div key={index} className="flex items-center gap-3 flex-wrap bg-white/5 border border-white/10 rounded-xl p-3 hover:border-accent/30 transition group">
                                        <span className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{index + 1}</span>
                                        {team.logoUrl ? (
                                            <img src={team.logoUrl} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                                        ) : (
                                            <div className="w-8 h-8 bg-neutral-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                {team.name ? team.name.substring(0, 2).toUpperCase() : '?'}
                                            </div>
                                        )}
                                        <input
                                            type="text"
                                            value={team.name}
                                            onChange={(e) => handleTeamNameChange(index, e.target.value)}
                                            className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-white placeholder-gray-700"
                                            placeholder={`Team Name ${index + 1}`}
                                        />
                                        <div className="w-full sm:w-48 relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => handleTeamLogoUpload(index, e)}
                                                disabled={uploadingTeamIndex === index}
                                                className="w-full bg-neutral-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent/50 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-white/10 file:text-white hover:file:bg-white/20 disabled:opacity-50 cursor-pointer"
                                            />
                                            {uploadingTeamIndex === index && (
                                                <div className="absolute inset-0 bg-neutral-800/90 rounded-lg flex items-center justify-between px-3">
                                                    <span className="text-xs text-accent font-bold animate-pulse">Uploading...</span>
                                                    <button onClick={() => cancelTeamLogoUpload()} className="text-xs text-red-400 hover:text-red-300 font-bold z-10 relative">✕</button>
                                                </div>
                                            )}
                                        </div>
                                        {team.logoUrl && (
                                            <button onClick={() => handleTeamLogoChange(index, '')} className="p-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition border border-red-500/20 mt-2 sm:mt-0" title="Remove logo">
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="sticky bottom-6 bg-neutral-950/80 backdrop-blur-md p-4 border-t border-white/10 -mx-6 md:mx-0 md:rounded-2xl md:border mt-8 flex justify-between items-center z-40">
                                <div className="text-sm text-gray-400">
                                    {teams.some(t => !t.name) ? 'Fill all team names to proceed' : 'Ready to preview bracket'}
                                </div>
                                <button
                                    onClick={handleGenerateBracket}
                                    disabled={teams.some(t => !t.name) || uploadingTeamIndex !== null}
                                    className="bg-accent text-black font-bold px-8 py-3 rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                                >
                                    Preview Bracket
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Bracket Preview + Reshuffle */}
                    {step === 3 && (
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm animate-fade-in">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold">Bracket Preview</h3>
                                <button
                                    onClick={handleReshuffle}
                                    className="flex items-center gap-2 bg-white/5 border border-white/10 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-white/10 transition"
                                >
                                    <RefreshCw className="w-4 h-4" /> Reshuffle
                                </button>
                            </div>

                            <p className="text-gray-400 text-sm mb-6">Review the matchups below. Click "Reshuffle" to randomize again.</p>

                            <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-4">
                                {/* Group stage is always used */}
                                {(() => {
                                    const total = shuffledTeams.length;
                                    if (total === 0) return null;

                                    let numGroups: number;
                                    if (total === 4) numGroups = 1;
                                    else if (total === 8) numGroups = 2;
                                    else if (total === 12) numGroups = 3;
                                    else numGroups = 4;

                                    const groupSize = total / numGroups;
                                    const groups: Team[][] = [];
                                    let index = 0;
                                    for (let g = 0; g < numGroups; g++) {
                                        groups.push(shuffledTeams.slice(index, index + groupSize));
                                        index += groupSize;
                                    }

                                    const labels = ['Group A', 'Group B', 'Group C', 'Group D'];

                                    const gridColsClass =
                                        numGroups === 1
                                            ? 'grid-cols-1'
                                            : numGroups === 2
                                            ? 'grid-cols-1 md:grid-cols-2'
                                            : numGroups === 3
                                            ? 'grid-cols-1 md:grid-cols-3'
                                            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

                                    return (
                                        <div className={`grid ${gridColsClass} gap-4`}>
                                            {groups.map((groupTeams, gIdx) => (
                                                <div
                                                    key={gIdx}
                                                    className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] transition flex flex-col"
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="font-bold text-white text-sm uppercase tracking-wide">
                                                            {labels[gIdx]}
                                                        </h4>
                                                        <span className="text-[10px] text-gray-400 font-mono">
                                                            {groupTeams.length} Teams
                                                        </span>
                                                    </div>
                                                    {groupTeams.length === 0 ? (
                                                        <p className="text-xs text-gray-500 italic">
                                                            No team assigned.
                                                        </p>
                                                    ) : (
                                                        <ul className="space-y-2 text-sm">
                                                            {groupTeams.map(team => (
                                                                <li
                                                                    key={team.id}
                                                                    className="flex items-center gap-2 text-white"
                                                                >
                                                                    <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[11px] font-bold text-gray-300">
                                                                        {team.name.substring(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <span className="truncate">{team.name}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:justify-between items-center gap-4 mt-8 pt-6 border-t border-white/10">
                                <button
                                    onClick={() => setStep(2)}
                                    className="text-gray-400 hover:text-white transition font-bold order-2 sm:order-1"
                                >
                                    ← Back to Teams
                                </button>
                                <button
                                    onClick={handleSubmitForApproval}
                                    disabled={isSubmitting}
                                    className="bg-accent text-black font-bold px-8 py-3 rounded-xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,215,0,0.3)] flex items-center gap-2 w-full sm:w-auto justify-center order-1 sm:order-2"
                                >
                                    {isSubmitting ? 'Submitting...' : 'Request Approval'} <ArrowRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Approval Pending */}
                    {step === 4 && (
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-10 backdrop-blur-sm animate-fade-in text-center space-y-6">
                            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                                <Trophy className="w-10 h-10 text-green-500" />
                            </div>

                            <h2 className="text-3xl font-display font-bold uppercase text-white">Tournament Created!</h2>

                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 max-w-xl mx-auto">
                                <p className="text-yellow-400 font-bold text-lg mb-2">⏳ Pending Approval</p>
                                <p className="text-gray-300 leading-relaxed">
                                    Your tournament has been submitted for admin approval. This normally takes a maximum of <strong className="text-white">1 day</strong>.
                                </p>
                                <p className="text-gray-400 mt-3 text-sm">
                                    For any queries or faster processing, contact us on WhatsApp:
                                </p>
                                <a
                                    href="https://wa.me/8801782213173"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 mt-3 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.315 0-4.458-.774-6.175-2.082l-.432-.328-3.345 1.121 1.121-3.345-.328-.432A9.935 9.935 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" /></svg>
                                    WhatsApp: 01782213173
                                </a>
                            </div>

                            <div className="flex gap-4 flex-wrap justify-center mt-6">
                                <button
                                    onClick={() => navigate(`/tournament/${createdTournamentId}`)}
                                    className="bg-accent text-black font-bold px-8 py-3 rounded-xl hover:bg-accent/90 transition"
                                >
                                    View Tournament
                                </button>
                                <button
                                    onClick={() => navigate('/dashboard')}
                                    className="bg-white/5 border border-white/10 text-white font-bold px-8 py-3 rounded-xl hover:bg-white/10 transition"
                                >
                                    Go to Dashboard
                                </button>
                            </div>
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
        </div>
    );
}
