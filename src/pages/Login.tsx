import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/dashboard');
        } catch (err: any) {
            console.error("Login Error:", err);
            setError('Failed to login. Please check your email and password.');
        }
    };

    return (
        <div className="min-h-screen bg-transparent text-white flex flex-col">
            <Navbar />
            <main className="flex-1 flex items-center justify-center px-6 pt-16">
                <div className="w-full max-w-md bg-neutral-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
                    <h2 className="text-3xl font-bold mb-6 text-center">Login</h2>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400 text-sm">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                    placeholder="organizer@escrims.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>

                        </div>

                        <button type="submit" className="w-full bg-accent text-black font-bold py-3 rounded-lg hover:bg-accent/90 transition-colors">
                            Login
                        </button>
                    </form>

                    <p className="text-center mt-6 text-gray-400 text-sm">
                        Don't have an account? <Link to="/register" className="text-accent hover:underline">Register as Organizer</Link>
                    </p>
                </div>
            </main>
            <Footer />
        </div>
    );
}
