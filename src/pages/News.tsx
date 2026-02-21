import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

export default function News() {
    const [news, setNews] = useState<any[]>([]);

    useEffect(() => {
        const fetchNews = async () => {
            try {
                const q = query(collection(db, 'cms_news'), orderBy('date', 'desc'));
                const snap = await getDocs(q);
                setNews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error("Error fetching news:", error);
            }
        };
        fetchNews();
    }, []);

    return (
        <div className="min-h-screen bg-transparent text-white flex flex-col font-sans">
            <Navbar />
            <main className="flex-1 pt-24 pb-12 container mx-auto px-6">
                <header className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 uppercase">Latest News</h1>
                    <div className="h-1 w-20 bg-accent"></div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {news.map((item) => (
                        <div key={item.id} className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden hover:border-accent/50 transition-all group">
                            <div className="h-48 bg-neutral-800 relative overflow-hidden">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600 font-bold uppercase tracking-widest">No Image</div>
                                )}
                                <div className="absolute top-4 left-4 bg-accent text-black text-xs font-bold px-3 py-1 rounded-full uppercase">
                                    News
                                </div>
                            </div>
                            <div className="p-6">
                                <p className="text-gray-400 text-sm mb-3">
                                    {item.date && typeof item.date.toDate === 'function' ? item.date.toDate().toLocaleDateString() : 'No Date'}
                                </p>
                                <h2 className="text-2xl font-bold mb-3 leading-tight group-hover:text-accent transition-colors">
                                    <Link to={`/news/${item.id}`}>{item.title}</Link>
                                </h2>
                                <p className="text-gray-400 line-clamp-3 leading-relaxed mb-4">{item.summary}</p>
                                <Link to={`/news/${item.id}`} className="inline-block text-accent font-bold text-sm uppercase tracking-wider hover:underline">
                                    Read More
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>

                {news.length === 0 && (
                    <div className="text-center py-20 text-gray-500 text-xl">No news articles published.</div>
                )}

            </main>
            <Footer />
        </div>
    );
}
