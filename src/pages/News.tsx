import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

export default function News() {
    const [news, setNews] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNews = async () => {
            try {
                // 1. Fetch internal news from Firebase
                const q = query(collection(db, 'cms_news'), orderBy('date', 'desc'));
                const snap = await getDocs(q);
                const internalNews = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        title: data.title,
                        summary: data.summary,
                        content: data.content,
                        imageUrl: data.imageUrl,
                        date: data.date && typeof data.date.toDate === 'function' ? data.date.toDate() : new Date(),
                        isExternal: false,
                        externalUrl: ''
                    };
                });

                // 2. Fetch external news from RSS feed
                let externalNews: any[] = [];
                try {
                    const rssUrl = 'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fnews.google.com%2Frss%2Fsearch%3Fq%3D%22Mobile%2BLegends%22%2B(patch%2BOR%2Bupdate%2BOR%2Besports)';
                    const response = await fetch(rssUrl);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.items && Array.isArray(data.items)) {
                            externalNews = data.items.map((item: any, index: number) => {
                                // Strip HTML from description for summary
                                const rawText = (item.description || item.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                                const cleanSummary = rawText.length > 0
                                    ? rawText.substring(0, 150) + '...'
                                    : 'Read more about this external e-sports news...';

                                // Extract image from thumbnail, enclosure, or img tag
                                let extractedImage = item.thumbnail || (item.enclosure && item.enclosure.link) || '';
                                if (!extractedImage) {
                                    const imgMatch = (item.content || item.description || '').match(/<img[^>]+src="([^">]+)"/);
                                    if (imgMatch && imgMatch[1]) {
                                        extractedImage = imgMatch[1];
                                    }
                                }

                                // Fallback images from Unsplash (gaming/esports related)
                                const fallbackImages = [
                                    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80', // PC Gaming
                                    'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80', // Controller
                                    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80', // Retro Gaming
                                    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80', // Neon setup
                                    'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=800&q=80', // E-sports Arena
                                    'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?auto=format&fit=crop&w=800&q=80', // Gaming Concept
                                ];

                                // Deterministic fallback based on title
                                const getFallbackImage = (title: string) => {
                                    let hash = 0;
                                    for (let i = 0; i < title.length; i++) {
                                        hash = title.charCodeAt(i) + ((hash << 5) - hash);
                                    }
                                    const index = Math.abs(hash) % fallbackImages.length;
                                    return fallbackImages[index];
                                };

                                return {
                                    id: `ext-${Date.now()}-${index}`,
                                    title: item.title,
                                    summary: cleanSummary,
                                    content: item.content || item.description || '',
                                    imageUrl: extractedImage || getFallbackImage(item.title),
                                    date: new Date(item.pubDate),
                                    isExternal: true,
                                    externalUrl: item.link
                                };
                            });
                        }
                    }
                } catch (apiError) {
                    console.error("Error fetching external RSS news:", apiError);
                    // Don't fail the whole page if RSS fails
                }

                // 3. Combine and sort
                const combinedNews = [...internalNews, ...externalNews];
                combinedNews.sort((a, b) => b.date.getTime() - a.date.getTime());

                setNews(combinedNews);
            } catch (error) {
                console.error("Error fetching news:", error);
            } finally {
                setLoading(false);
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
                        <div key={item.id} className="bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden hover:border-accent/50 transition-all group flex flex-col">
                            <div className="h-48 bg-neutral-800 relative overflow-hidden shrink-0">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600 font-bold uppercase tracking-widest bg-neutral-800">No Image</div>
                                )}
                                <div className="absolute top-4 left-4 bg-accent text-black text-xs font-bold px-3 py-1 rounded-full uppercase shadow-md">
                                    {item.isExternal ? 'External News' : 'Official News'}
                                </div>
                            </div>
                            <div className="p-6 flex flex-col flex-1">
                                <p className="text-gray-400 text-sm mb-3 font-mono">
                                    {item.date ? item.date.toLocaleDateString() : 'No Date'}
                                </p>
                                <h2 className="text-2xl font-bold mb-3 leading-tight group-hover:text-accent transition-colors line-clamp-2">
                                    {item.isExternal ? (
                                        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer">{item.title}</a>
                                    ) : (
                                        <Link to={`/news/${item.id}`}>{item.title}</Link>
                                    )}
                                </h2>
                                <p className="text-gray-400 line-clamp-3 leading-relaxed mb-6 flex-1">
                                    {item.summary}
                                </p>
                                <div className="mt-auto pt-4 border-t border-white/10">
                                    {item.isExternal ? (
                                        <a
                                            href={item.externalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-block text-accent font-bold text-sm uppercase tracking-wider hover:underline"
                                        >
                                            Read More (External)
                                        </a>
                                    ) : (
                                        <Link
                                            to={`/news/${item.id}`}
                                            className="inline-block text-accent font-bold text-sm uppercase tracking-wider hover:underline"
                                        >
                                            Read More
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {!loading && news.length === 0 && (
                    <div className="text-center py-20 text-gray-500 text-xl font-display">No news articles available.</div>
                )}

                {loading && (
                    <div className="text-center py-20">
                        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="mt-4 text-gray-400 animate-pulse">Fetching latest news...</p>
                    </div>
                )}

            </main>
            <Footer />
        </div>
    );
}
