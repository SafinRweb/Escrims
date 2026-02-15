import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Building2, User } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export default function RegisterOrganizer() {
    const [formData, setFormData] = useState({
        name: '',
        orgName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            // Create Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            const user = userCredential.user;

            // Update Profile Name
            await updateProfile(user, { displayName: formData.name });

            // Create User Document in Firestore
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name: formData.name,
                email: formData.email,
                organizationName: formData.orgName,
                createdAt: serverTimestamp()
            });

            navigate('/dashboard');
        } catch (err: any) {
            console.error("Registration Error:", err);
            setError(err.message || "Failed to register. Please try again.");
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
            <Navbar />
            <main className="flex-1 flex items-center justify-center px-6 pt-16 py-12">
                <div className="w-full max-w-md bg-neutral-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
                    <h2 className="text-3xl font-bold mb-6 text-center">Organizer Registration</h2>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                    placeholder="John Doe"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Organization/Team Name</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="text"
                                    value={formData.orgName}
                                    onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                                    className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                    placeholder="Escrims Esports"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-neutral-950 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                    placeholder="Create a password"
                                    required
                                />
                            </div>

                            {/* Dynamic Password Feedback */}
                            <div className="mt-2 space-y-1 text-xs text-gray-500">
                                <p className={formData.password.length >= 8 ? "text-green-500" : ""}>• At least 8 characters</p>
                                <p className={/[A-Z]/.test(formData.password) ? "text-green-500" : ""}>• One uppercase letter</p>
                                <p className={/[0-9]/.test(formData.password) ? "text-green-500" : ""}>• One number</p>
                                <p className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? "text-green-500" : ""}>• One special character</p>
                            </div>
                        </div>


                        <button type="submit" className="w-full bg-accent text-black font-bold py-3 rounded-lg hover:bg-accent/90 transition-colors">
                            Create Account
                        </button>
                    </form>

                    <p className="text-center mt-6 text-gray-400 text-sm">
                        Already have an account? <Link to="/login" className="text-accent hover:underline">Login here</Link>
                    </p>
                </div>
            </main >
            <Footer />
        </div >
    );
}
