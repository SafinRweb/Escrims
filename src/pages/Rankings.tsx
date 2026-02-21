import { useEffect, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';


export default function Rankings() {
    const [rankings, setRankings] = useState<any[]>([]);

    useEffect(() => {
        const fetchRankings = async () => {
            const snap = await getDocs(collection(db, 'cms_rankings'));
            const data = snap.docs.map(d => d.data());
            setRankings(data.sort((a: any, b: any) => a.rank - b.rank));
        };
        fetchRankings();
    }, []);

    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans">
            <Navbar />
            <main className="flex-1 pt-24 pb-12 container mx-auto px-6">
                <header className="mb-12 text-center">
                    <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 uppercase">Team Rankings</h1>
                    <p className="text-gray-400">Official Leaderboard - Season 2026</p>
                </header>

                <div className="max-w-4xl mx-auto bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white/5 text-accent font-bold uppercase text-sm tracking-wider">
                            <tr>
                                <th className="px-3 md:px-6 py-6">Rank</th>
                                <th className="px-3 md:px-6 py-6">Team</th>
                                <th className="px-3 md:px-6 py-6 text-right">Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rankings.map((team) => (
                                <tr key={team.rank} className="hover:bg-white/5 transition-colors">
                                    <td className="px-3 md:px-6 py-4 font-bold text-2xl font-mono text-gray-500">#{team.rank}</td>
                                    <td className="px-3 md:px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center font-bold text-sm">
                                                {team.teamName ? team.teamName.substring(0, 2) : 'NA'}
                                            </div>
                                            <span className="font-bold text-lg">{team.teamName || 'Unknown Team'}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 md:px-6 py-4 text-right font-mono text-xl text-accent">{team.points}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rankings.length === 0 && (
                        <div className="p-12 text-center text-gray-500">No rankings available yet.</div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}
