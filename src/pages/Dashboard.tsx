import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Calendar, Trophy, ArrowRight } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import { useAuth } from '../lib/AuthContext';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Dashboard() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [tournaments, setTournaments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return;
        }

        const fetchTournaments = async () => {
            try {
                const q = query(
                    collection(db, 'tournaments'),
                    where('organizerId', '==', currentUser.uid)
                );
                const querySnapshot = await getDocs(q);
                const fetchedTournaments = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Client-side sort since we might need a composite index for server-side
                fetchedTournaments.sort((a: any, b: any) => {
                    const dateA = a.createdAt?.seconds || 0;
                    const dateB = b.createdAt?.seconds || 0;
                    return dateB - dateA;
                });

                setTournaments(fetchedTournaments);
            } catch (error) {
                console.error("Error fetching tournaments:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTournaments();
    }, [currentUser]);

    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            <Navbar />
            <div className="container mx-auto px-6 py-24">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div>
                        <h1 className="text-3xl font-bold font-display">Organizer Dashboard</h1>
                        <p className="text-gray-400 mt-2">Manage your tournaments and settings</p>
                    </div>
                    <Link to="/create-tournament">
                        <button className="flex items-center gap-2 bg-accent text-black px-6 py-3 rounded-tr-xl rounded-bl-xl font-bold hover:bg-accent/90 hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                            <Plus className="w-5 h-5" />
                            Create Tournament
                        </button>
                    </Link>
                </header>

                {loading ? (
                    <div className="text-center py-20 text-gray-500">Loading tournaments...</div>
                ) : (
                    <>
                        {tournaments.length === 0 ? (
                            <div className="bg-neutral-900/50 border border-white/5 rounded-2xl p-12 flex flex-col items-center justify-center text-center border-dashed">
                                <Trophy className="w-16 h-16 text-gray-700 mb-4" />
                                <h3 className="text-xl font-bold text-gray-400 mb-2">No Active Tournaments</h3>
                                <p className="text-gray-500 max-w-md mb-8">
                                    You haven't created any tournaments yet. Get started by clicking the button above to launch your first event.
                                </p>
                                <Link to="/create-tournament" className="text-accent hover:underline font-bold">
                                    Create First Tournament
                                </Link>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {tournaments.map((tournament) => (
                                    <div
                                        key={tournament.id}
                                        onClick={() => navigate(`/tournament/${tournament.id}`)}
                                        className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 hover:border-accent/50 transition-all cursor-pointer group hover:-translate-y-1"
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="p-3 bg-white/5 rounded-lg text-accent">
                                                <Calendar className="w-6 h-6" />
                                            </div>
                                            <span className={`text-xs font-mono px-2 py-1 rounded ${tournament.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                                                {tournament.status?.toUpperCase() || 'DRAFT'}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-bold mb-2 group-hover:text-accent transition-colors line-clamp-1">{tournament.name}</h3>
                                        <p className="text-sm text-gray-400 mb-4">{tournament.teams?.length || 0} Teams • Single Elim</p>

                                        <div className="flex items-center text-sm text-gray-500 group-hover:text-white transition-colors">
                                            Manage Tournament <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
