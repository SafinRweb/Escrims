import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    isVisible: boolean;
    onClose: () => void;
    duration?: number;
}

const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const styles = {
    success: 'border-green-500/30 bg-green-500/10 text-green-400',
    error: 'border-red-500/30 bg-red-500/10 text-red-400',
    warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

const progressStyles = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
};

export default function Toast({ message, type, isVisible, onClose, duration = 3000 }: ToastProps) {
    useEffect(() => {
        if (isVisible && duration > 0) {
            const timer = setTimeout(onClose, duration);
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose]);

    if (!isVisible) return null;

    const Icon = icons[type];

    return (
        <div className="fixed top-6 right-6 z-[100] animate-slide-in">
            <div className={`flex items-start gap-3 px-5 py-4 rounded-xl border backdrop-blur-xl shadow-2xl min-w-[320px] max-w-[420px] ${styles[type]}`}>
                <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm font-medium flex-1">{message}</p>
                <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 transition">
                    <X className="w-4 h-4" />
                </button>
            </div>
            {/* Progress bar */}
            <div className="mt-1 mx-2 h-0.5 rounded-full bg-white/5 overflow-hidden">
                <div
                    className={`h-full rounded-full ${progressStyles[type]}`}
                    style={{ animation: `shrink ${duration}ms linear forwards` }}
                />
            </div>
        </div>
    );
}
