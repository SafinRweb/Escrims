import { Trophy, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { ADMIN_EMAILS } from '../../lib/admins';

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const { currentUser, logout } = useAuth(); // Connect to Auth

    const isAdmin = currentUser && currentUser.email && ADMIN_EMAILS.includes(currentUser.email);

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
                            Organizer Login
                        </Link>
                    )}
                </div>

                {/* Mobile Hamburger */}
                <button className="md:hidden text-white" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Mobile Dropdown */}
            {isOpen && (
                <div className="md:hidden border-t border-white/10 bg-neutral-950/95 backdrop-blur-md px-6 py-4 space-y-4">
                    <Link to="/" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>Home</Link>
                    <Link to="/ranking" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>Rankings</Link>
                    <Link to="/news" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>News</Link>
                    {currentUser ? (
                        <>
                            <Link to="/dashboard" className="block hover:text-accent transition-colors" onClick={() => setIsOpen(false)}>Dashboard</Link>
                            {isAdmin && (
                                <Link to="/admin" className="block text-purple-400 hover:text-purple-300 transition-colors" onClick={() => setIsOpen(false)}>Admin</Link>
                            )}
                            <button onClick={() => { logout(); setIsOpen(false); }} className="block text-gray-400 hover:text-white transition">Logout</button>
                        </>
                    ) : (
                        <Link to="/login" className="block text-accent font-bold" onClick={() => setIsOpen(false)}>Organizer Login</Link>
                    )}
                </div>
            )}
        </nav>
    );
}
