import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { Trophy, Clock } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Home() {
    const [supportedGames, setSupportedGames] = useState<any[]>([]);
    const [featuredTournaments, setFeaturedTournaments] = useState<any[]>([]);
    const [upcomingTournaments, setUpcomingTournaments] = useState<any[]>([]);
    const [topTeams, setTopTeams] = useState<any[]>([]);
    const [stats, setStats] = useState({ activeEvents: 120 });
    const { currentUser } = useAuth();

    useEffect(() => {
        const fetchContent = async () => {
            try {
                // Fetch Games
                const gamesSnap = await getDocs(collection(db, 'cms_games'));
                setSupportedGames(gamesSnap.docs.map(d => d.data()));

                // Fetch Tournaments
                const tourneysSnap = await getDocs(query(collection(db, 'tournaments'), limit(50)));
                const allTourneys = tourneysSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                // Featured = approved, sorted by prize pool (biggest first)
                const approved = allTourneys
                    .filter((t: any) => t.status === 'approved')
                    .sort((a: any, b: any) => (b.prizePoolValue || 0) - (a.prizePoolValue || 0));
                setFeaturedTournaments(approved.slice(0, 6));

                // Upcoming = pending_approval (so visitors can see what's coming)
                const upcoming = allTourneys
                    .filter((t: any) => t.status === 'pending_approval');
                setUpcomingTournaments(upcoming.slice(0, 6));

                // Fetch Top Teams (Rankings)
                const ranksSnap = await getDocs(collection(db, 'cms_rankings'));
                const ranksData = ranksSnap.docs.map(d => d.data()).sort((a: any, b: any) => a.rank - b.rank).slice(0, 5);
                setTopTeams(ranksData);

                // Fetch Stats
                const statsSnap = await getDocs(collection(db, 'cms_settings'));
                if (!statsSnap.empty) {
                    const data = statsSnap.docs[0].data();
                    if (data.activeEventsCount) {
                        setStats({ activeEvents: data.activeEventsCount });
                    }
                }
            } catch (error) {
                console.error("Error fetching home content:", error);
            }
        };
        fetchContent();
    }, []);

    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans">
            <Navbar />
            <main className="flex-1 pt-24 pb-12 px-6 container mx-auto">
                <div className="max-w-4xl mx-auto text-center space-y-6 py-10 md:py-20">
                    <h1 className="text-3xl sm:text-5xl md:text-8xl font-display font-bold tracking-tight uppercase break-words">
                        BANGLADESH'S FIRST <br /> <span className="text-accent">TOURNAMENT</span> PLATFORM
                    </h1>
                    <p className="text-lg sm:text-2xl text-gray-400 max-w-2xl mx-auto font-sans font-light">
                        Organize, compete, and track esports tournaments with professional-grade tools.
                    </p>

                    {/* Mobile-only login CTA */}
                    {!currentUser && (
                        <div className="md:hidden mt-4">
                            <Link
                                to="/login"
                                className="inline-block px-8 py-3 bg-accent text-black font-bold rounded-full hover:bg-accent/90 transition shadow-[0_0_20px_rgba(255,215,0,0.3)] text-lg"
                            >
                                Create Your Own Tournament
                            </Link>
                        </div>
                    )}
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                    {/* Featured Tournaments - Large Block */}
                    <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 md:col-span-2 md:row-span-2 hover:border-accent/30 transition-all group overflow-y-auto custom-scrollbar min-h-[300px]">
                        <h3 className="text-xl sm:text-3xl font-display font-bold mb-6 text-accent uppercase flex items-center gap-3">
                            <Trophy className="w-8 h-8" /> Featured Tournaments
                        </h3>
                        <div className="space-y-4">
                            {featuredTournaments.length === 0 ? (
                                <p className="text-gray-500">No featured tournaments yet.</p>
                            ) : (
                                featuredTournaments.map((t, i) => (
                                    <Link to={`/tournament/${t.id}`} key={i} className="bg-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 group-hover:bg-white/10 transition-colors cursor-pointer hover:border border-transparent hover:border-accent/30">
                                        {t.imageUrl ? (
                                            <img src={t.imageUrl} className="w-full sm:w-16 h-32 sm:h-16 rounded-lg object-cover" alt={t.name} />
                                        ) : (
                                            <div className="w-full sm:w-16 h-32 sm:h-16 bg-neutral-800 rounded-lg flex items-center justify-center font-display text-gray-500 font-bold text-lg sm:text-xs">{t.name?.substring(0, 2)}</div>
                                        )}
                                        <div className="flex-1 min-w-0 w-full">
                                            <h4 className="font-bold text-lg sm:text-xl uppercase line-clamp-2 sm:line-clamp-1">{t.name}</h4>
                                            <p className="text-sm text-gray-400 mt-1">{t.teams?.length || 0} Teams</p>
                                        </div>
                                        {t.prizePool && (
                                            <span className="text-accent font-bold text-sm bg-accent/10 px-3 py-1.5 rounded-lg shrink-0">💰 {t.prizePool}</span>
                                        )}
                                    </Link>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Active Events Stat */}
                    <div className="bg-accent text-black rounded-2xl p-6 flex flex-col justify-center items-center md:col-span-1 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                        <span className="text-6xl font-display font-bold">{stats.activeEvents}+</span>
                        <span className="text-xl font-bold uppercase tracking-widest opacity-80 text-center">Active Events</span>
                    </div>

                    {/* Supported Games (Dynamic) */}
                    <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 md:col-span-1 md:row-span-2 flex flex-col">
                        <h3 className="text-xl font-display font-bold mb-4 uppercase text-gray-400">Supported Games</h3>
                        <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
                            {supportedGames.length === 0 ? (
                                <p className="text-gray-500 text-sm">No games added yet.</p>
                            ) : (
                                supportedGames.map((game, idx) => (
                                    <div key={idx} className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-white/10 p-3 rounded-xl flex items-center gap-3 hover:bg-white/5 transition-colors">
                                        {game.imageUrl ? (
                                            <img src={game.imageUrl} className="w-8 h-8 rounded-full object-cover" alt={game.name} />
                                        ) : (
                                            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center font-bold text-white text-xs">{game.name?.substring(0, 2)}</div>
                                        )}
                                        <div>
                                            <p className="font-bold leading-none text-sm">{game.name}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Top Teams - Small Block */}
                    <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 md:col-span-1 flex flex-col overflow-y-auto custom-scrollbar">
                        <h3 className="text-xl font-display font-bold mb-4 uppercase text-gray-400 flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-accent" /> Top Teams
                        </h3>
                        <div className="space-y-3">
                            {topTeams.length === 0 ? (
                                <p className="text-gray-500 text-sm">No rankings yet.</p>
                            ) : (
                                topTeams.map((team, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                                        <div className="w-6 h-6 bg-accent text-black rounded-full flex items-center justify-center font-bold text-xs">#{team.rank}</div>
                                        <span className="font-bold text-sm truncate">{team.teamName}</span>
                                        <span className="ml-auto text-xs text-gray-400 font-mono">{team.points}pts</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>

                {/* Upcoming Tournaments Section */}
                {upcomingTournaments.length > 0 && (
                    <div className="mt-8">
                        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6">
                            <h3 className="text-2xl font-display font-bold mb-6 uppercase text-gray-300 flex items-center gap-3">
                                <Clock className="w-7 h-7 text-yellow-500" /> Upcoming Tournaments
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {upcomingTournaments.map((t, i) => (
                                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                                        {t.imageUrl ? (
                                            <img src={t.imageUrl} className="w-14 h-14 rounded-lg object-cover" alt={t.name} />
                                        ) : (
                                            <div className="w-14 h-14 bg-neutral-800 rounded-lg flex items-center justify-center font-display text-gray-500 font-bold text-xs">{t.name?.substring(0, 2)}</div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-lg uppercase line-clamp-1">{t.name}</h4>
                                            <p className="text-sm text-gray-400">
                                                {t.teams?.length || 0} Teams
                                                {t.prizePool && <span className="text-accent ml-2">• 💰 {t.prizePool}</span>}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

            </main>
            <Footer />
        </div>
    );
}
