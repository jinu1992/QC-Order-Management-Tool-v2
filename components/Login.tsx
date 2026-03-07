import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheckIcon, RefreshIcon, XCircleIcon, LockClosedIcon, InfoIcon } from './icons/Icons';

interface LoginProps {
    onLoginSuccess: (user: User, tokens?: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data.user) {
                setIsLoading(false);
                onLoginSuccess(event.data.user, event.data.tokens);
            }
            
            if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
                setIsLoading(false);
                setError(event.data.message || 'Authentication failed.');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onLoginSuccess]);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/auth/google/url');
            const { url } = await res.json();
            window.open(url, 'google_auth', 'width=600,height=700');
        } catch (e: any) {
            setError('Failed to initiate login.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4 font-sans relative overflow-hidden">
            {/* Soft decorative gradients */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
                <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-partners-green rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]"></div>
            </div>

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-10 animate-in fade-in slide-in-from-top-6 duration-1000">
                    <div className="relative inline-block mb-6 group">
                        <div className="absolute inset-0 bg-partners-green rounded-3xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity"></div>
                        <div className="relative inline-flex items-center justify-center w-24 h-24 bg-partners-green rounded-[2.5rem] text-white font-black text-5xl shadow-2xl border-4 border-white">
                            C
                        </div>
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2">Cubelelo B2B</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Internal Access Portal</p>
                </div>

                <div className="bg-white p-1 rounded-[3.5rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.1)] border border-gray-100 relative overflow-hidden">
                    <div className="p-10 relative z-10">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                                    <LockClosedIcon className="h-5 w-5" />
                                </div>
                                <h2 className="text-xl font-bold text-gray-800 tracking-tight">Secured Access</h2>
                            </div>
                            {isLoading && <RefreshIcon className="h-5 w-5 text-partners-green animate-spin" />}
                        </div>
                        
                        {error && (
                            <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-sm flex items-start gap-3 animate-in shake duration-300">
                                <XCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                <div className="flex flex-col gap-1">
                                    <span className="font-bold">Connection Failed</span>
                                    <span className="text-xs opacity-80">{error}</span>
                                </div>
                            </div>
                        )}

                        <div className="space-y-8 flex flex-col items-center">
                            <p className="text-gray-500 text-sm text-center font-medium leading-relaxed px-4">
                                This dashboard is restricted. Use your <span className="font-bold text-gray-800">@cubelelo.com</span> account to continue.
                            </p>

                            <div className="w-full flex flex-col items-center gap-4 min-h-[50px] relative">
                                <button 
                                    onClick={handleGoogleLogin}
                                    disabled={isLoading}
                                    className={`w-full py-4 bg-white border-2 border-gray-100 text-gray-700 rounded-full font-bold text-sm shadow-sm hover:border-partners-green hover:text-partners-green transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isLoading ? (
                                        <RefreshIcon className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                        </svg>
                                    )}
                                    {isLoading ? 'Verifying...' : 'Sign in with Google'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex flex-col items-center gap-6">
                    <div className="flex items-center justify-center gap-3 py-2 px-4 bg-white/50 backdrop-blur-sm rounded-full border border-gray-200/50 shadow-sm">
                        <ShieldCheckIcon className="h-4 w-4 text-partners-green" />
                        <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">Encrypted Session Active</span>
                    </div>
                    
                    <div className="text-center space-y-1">
                        <p className="text-gray-400 text-[10px] uppercase font-bold tracking-[0.3em]">
                            &copy; 2024 CUBELELO PRIVATE LIMITED
                        </p>
                        <p className="text-gray-300 text-[8px] font-mono tracking-widest">BUILD 1.0.7-SECURE-STABLE</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
