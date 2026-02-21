import { Trophy, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { ADMIN_EMAILS } from '../../lib/admins';

function setGoogleTranslateLanguage(langCode: string) {
    // Set the googtrans cookie which Google Translate reads
    const value = langCode === 'en' ? '' : `/en/${langCode}`;
    document.cookie = `googtrans=${value}; path=/`;
    document.cookie = `googtrans=${value}; path=/; domain=${window.location.hostname}`;

    // If the Google Translate combo box exists, change its value
    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
    if (select) {
        select.value = langCode;
        select.dispatchEvent(new Event('change'));
    } else {
        // Fallback: reload so the cookie takes effect
        window.location.reload();
    }
}

function getCurrentLang(): boolean {
    // Check if currently in Bangla
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('googtrans='));
    if (cookie) {
        return cookie.includes('/bn');
    }
    return false;
}

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [isBangla, setIsBangla] = useState(false);
    const { currentUser, logout } = useAuth();

    const isAdmin = currentUser && currentUser.email && ADMIN_EMAILS.includes(currentUser.email);

    useEffect(() => {
        setIsBangla(getCurrentLang());
    }, []);

    const toggleLanguage = () => {
        const newLang = isBangla ? 'en' : 'bn';
        setIsBangla(!isBangla);
        setGoogleTranslateLanguage(newLang);
    };

    const LangToggle = () => (
        <button
            onClick={toggleLanguage}
            className="lang-toggle relative flex items-center w-[72px] h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer overflow-hidden"
            title={isBangla ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
        >
            <span className={`absolute left-1 top-1 w-[30px] h-6 rounded-full bg-accent transition-transform duration-300 ${isBangla ? 'translate-x-[34px]' : 'translate-x-0'}`} />
            <span className={`relative z-10 flex-1 text-center text-[11px] font-bold transition-colors ${!isBangla ? 'text-black' : 'text-gray-400'}`}>EN</span>
            <span className={`relative z-10 flex-1 text-center text-[11px] font-bold transition-colors ${isBangla ? 'text-black' : 'text-gray-400'}`}>বাং</span>
        </button>
    );

    return (
        <nav className="fixed w-full z-50 bg-neutral-950/80 backdrop-blur-md border-b border-white/10">
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 text-2xl font-display font-bold tracking-wider">
                    <Trophy className="text-accent" />
                    ESCRIMS
                </Link>

                <div className="hidden md:flex items-center gap-8">
                    <Link to="/" className="hover:text-accent transition-colors">Home</Link>
                    <Link to="/ranking" className="hover:text-accent transition-colors">Rankings</Link>
                    <Link to="/news" className="hover:text-accent transition-colors">News</Link>
                    <LangToggle />
                </div>

                <div className="hidden md:flex items-center gap-4">
                    {currentUser ? (
                        <>
                            <Link to="/dashboard" className="px-6 py-2 bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition font-bold">
                                Dashboard
                            </Link>

                            {isAdmin && (
                                <Link to="/admin" className="px-6 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-full hover:bg-purple-500/20 transition font-bold">
                                    Admin
                                </Link>
                            )}
                            <button
                                onClick={() => logout()}
                                className="text-gray-400 hover:text-white transition"
                            >
                                Logout
                            </button>
                        </>
                    ) : (
                        <Link to="/login" className="px-8 py-2 bg-accent text-black font-bold rounded-full hover:bg-accent/90 transition shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                            Create Your Own Tournament
                        </Link>
                    )}
                </div>

                {/* Mobile Hamburger */}
                <div className="md:hidden flex items-center gap-3">
                    <LangToggle />
                    <button className="text-white" onClick={() => setIsOpen(!isOpen)}>
                        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Dropdown */}
            {isOpen && (
                <div className="md:hidden border-t border-white/10 bg-neutral-950/95 backdrop-blur-md px-6 py-4 space-y-4">
                    <Link to="/" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>Home</Link>
                    <Link to="/ranking" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>Rankings</Link>
                    <Link to="/news" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>News</Link>
                    {currentUser && (
                        <>
                            <Link to="/dashboard" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>Dashboard</Link>
                            {isAdmin && (
                                <Link to="/admin" className="block text-purple-400 hover:text-purple-300 transition-colors" onClick={() => setIsOpen(false)}>Admin</Link>
                            )}
                            <div className="pt-3 mt-3 border-t border-white/10">
                                <button
                                    onClick={() => { logout(); setIsOpen(false); }}
                                    className="w-full text-left px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition font-bold text-sm"
                                >
                                    Logout
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Hidden Google Translate element - needed for the API to work */}
            <div id="google_translate_element" style={{ display: 'none' }}></div>
        </nav>
    );
}
