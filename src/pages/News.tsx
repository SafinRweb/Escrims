import { useEffect, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

const FALLBACK_IMAGE =
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';

function formatDate(dateString: string): string {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
    });
}

function SkeletonCard() {
    return (
        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden flex flex-col animate-pulse">
            <div className="h-48 bg-neutral-800" />
            <div className="p-6 flex flex-col gap-3 flex-1">
                <div className="h-4 w-24 bg-neutral-700 rounded" />
                <div className="h-5 w-full bg-neutral-700 rounded" />
                <div className="h-5 w-3/4 bg-neutral-700 rounded" />
                <div className="h-4 w-full bg-neutral-700/60 rounded mt-2" />
                <div className="h-4 w-5/6 bg-neutral-700/60 rounded" />
                <div className="mt-auto pt-4 border-t border-white/10">
                    <div className="h-4 w-28 bg-neutral-700 rounded" />
                </div>
            </div>
        </div>
    );
}

export default function News() {
    const [articles, setArticles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchArticles = async () => {
            try {
                const apiKey = import.meta.env.VITE_GNEWS_API_KEY;
                const url = `https://gnews.io/api/v4/search?q="esports" OR "valorant" OR "mobile legends" OR "pubg" OR "dota 2" OR "cs2" OR "esports tournament" OR "competitive gaming"&lang=en&max=9&in=title&apikey=${apiKey}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`API responded with status ${response.status}`);
                }

                const data = await response.json();
                const raw = data.articles ?? [];

                // Deduplicate by title
                const seen = new Set<string>();
                const unique = raw.filter((a: any) => {
                    const key = a.title?.toLowerCase().trim();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                setArticles(unique);
            } catch (err: any) {
                console.error('Error fetching GNews articles:', err);
                setError(err.message || 'Failed to fetch news.');
            } finally {
                setLoading(false);
            }
        };

        fetchArticles();
    }, []);

    return (
        <div className="min-h-screen bg-transparent text-white flex flex-col font-sans">
            <Navbar />
            <main className="flex-1 pt-24 pb-12 container mx-auto px-6">
                <header className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 uppercase">
                        Latest News
                    </h1>
                    <div className="h-1 w-20 bg-accent" />
                </header>

                {/* Loading skeleton grid */}
                {loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonCard key={i} />
                        ))}
                    </div>
                )}

                {/* Error state */}
                {!loading && error && (
                    <div className="text-center py-20">
                        <p className="text-gray-400 text-xl font-display">
                            Unable to load the latest news right now. Check back later.
                        </p>
                    </div>
                )}

                {/* Empty state */}
                {!loading && !error && articles.length === 0 && (
                    <div className="text-center py-20 text-gray-500 text-xl font-display">
                        No news articles available.
                    </div>
                )}

                {/* Articles grid */}
                {!loading && !error && articles.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {articles.map((article, index) => (
                            <a
                                key={index}
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden hover:border-accent/50 transition-all group flex flex-col cursor-pointer"
                            >
                                <div className="h-48 bg-neutral-800 relative overflow-hidden shrink-0">
                                    <img
                                        src={article.image || FALLBACK_IMAGE}
                                        alt={article.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                                        }}
                                    />
                                    <div className="absolute top-4 left-4 bg-accent text-black text-xs font-bold px-3 py-1 rounded-full uppercase shadow-md">
                                        Live Feed
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col flex-1">
                                    <p className="text-gray-400 text-sm mb-3 font-mono">
                                        {article.publishedAt
                                            ? formatDate(article.publishedAt)
                                            : 'No Date'}
                                    </p>
                                    <h2 className="text-2xl font-bold mb-3 leading-tight group-hover:text-accent transition-colors line-clamp-2">
                                        {article.title}
                                    </h2>
                                    <p className="text-gray-400 line-clamp-3 leading-relaxed mb-6 flex-1">
                                        {article.description}
                                    </p>
                                    <div className="mt-auto pt-4 border-t border-white/10">
                                        <span className="inline-block text-accent font-bold text-sm uppercase tracking-wider group-hover:underline">
                                            Read More →
                                        </span>
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}
