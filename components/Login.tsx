import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { ShieldCheckIcon, RefreshIcon, XCircleIcon, LockClosedIcon, InfoIcon } from './icons/Icons';
import { loginWithGoogle } from '../services/api';

interface LoginProps {
    onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSdkLoaded, setIsSdkLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const googleButtonRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);

    // Using the specific working Client ID provided
    const CLIENT_ID = "763018750068-sbk6u9ka6k1r665h92tlqm3b796td5kp.apps.googleusercontent.com";

    const handleGoogleLogin = async (response: any) => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await loginWithGoogle(response.credential);
            if (result.status === 'success' && result.user) {
                onLoginSuccess(result.user);
            } else {
                setError(result.message || 'Access Denied. Your email is not authorized for this portal.');
            }
        } catch (e: any) {
            console.error("Login verification error:", e);
            // Display the specific error message from the API service
            setError(e.message || 'Verification failed. Please check your backend configuration.');
        } finally {
            setIsLoading(false);
        }
    };

    const initializeGoogleSignIn = () => {
        const google = (window as any).google;
        if (google && google.accounts && !initializedRef.current) {
            try {
                google.accounts.id.initialize({
                    client_id: CLIENT_ID,
                    callback: handleGoogleLogin,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });

                if (googleButtonRef.current) {
                    google.accounts.id.renderButton(googleButtonRef.current, {
                        theme: "outline",
                        size: "large",
                        text: "signin_with",
                        shape: "pill",
                        width: 320
                    });
                    initializedRef.current = true;
                    setIsSdkLoaded(true);
                }
            } catch (err) {
                console.error("Google SDK Init Error:", err);
            }
        }
    };

    useEffect(() => {
        const checkGoogle = () => {
            if ((window as any).google) {
                initializeGoogleSignIn();
            }
        };

        checkGoogle();
        const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (script) {
            script.addEventListener('load', checkGoogle);
        }

        const interval = setInterval(() => {
            if (!initializedRef.current) checkGoogle();
        }, 1500);

        return () => {
            clearInterval(interval);
            if (script) script.removeEventListener('load', checkGoogle);
        };
    }, []);

    const handleBypass = () => {
        onLoginSuccess({
            id: 'admin-1',
            name: 'Jainendra',
            email: 'jainendra@cubelelo.com',
            contactNumber: '9999999999',
            role: 'Admin',
            avatarInitials: 'JC'
        });
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
                                {/* Google Sign-In Button Container */}
                                <div 
                                    ref={googleButtonRef} 
                                    id="googleBtn"
                                    className={`transition-all duration-700 ${!isSdkLoaded || isLoading ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
                                ></div>
                                
                                {(!isSdkLoaded || isLoading) && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                        <RefreshIcon className="h-8 w-8 text-partners-green animate-spin" />
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                            {isLoading ? 'Verifying...' : 'Initializing...'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Separation Line */}
                            <div className="w-full flex items-center gap-4 py-2">
                                <div className="h-px flex-1 bg-gray-100"></div>
                                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Or</span>
                                <div className="h-px flex-1 bg-gray-100"></div>
                            </div>

                            {/* Dev Bypass Button */}
                            <button 
                                onClick={handleBypass}
                                className="w-full py-4 bg-gray-900 text-white rounded-full font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                <InfoIcon className="h-4 w-4" />
                                Bypass & Sign In (Dev Mode)
                            </button>
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