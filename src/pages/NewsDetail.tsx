import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { ArrowLeft, Calendar } from 'lucide-react';

export default function NewsDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [news, setNews] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNews = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'cms_news', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setNews({ id: docSnap.id, ...docSnap.data() });
                } else {
                    navigate('/news');
                }
            } catch (error) {
                console.error("Error fetching news:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchNews();
    }, [id, navigate]);

    if (loading) return <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">Loading...</div>;

    if (!news) return null;

    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-24">
                <button
                    onClick={() => navigate('/news')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" /> Back to News
                </button>

                <article className="max-w-4xl mx-auto">
                    {news.imageUrl && (
                        <img
                            src={news.imageUrl}
                            alt={news.title}
                            className="w-full h-[200px] sm:h-[300px] md:h-[400px] object-cover rounded-2xl mb-8 border border-white/10"
                        />
                    )}

                    <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{news.title}</h1>

                    <div className="flex items-center gap-4 text-gray-400 mb-8 pb-8 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            <span>{news.date && typeof news.date.toDate === 'function' ? news.date.toDate().toLocaleDateString() : 'Recent'}</span>
                        </div>
                    </div>

                    <div className="prose prose-invert prose-lg max-w-none">
                        <p className="text-xl text-gray-300 font-light mb-8 leading-relaxed">
                            {news.summary}
                        </p>
                        {news.content ? (
                            <div className="whitespace-pre-wrap text-gray-300">
                                {news.content}
                            </div>
                        ) : (
                            <p className="text-gray-500 italic">No additional content available.</p>
                        )}
                    </div>
                </article>
            </div>
            <Footer />
        </div>
    );
}
