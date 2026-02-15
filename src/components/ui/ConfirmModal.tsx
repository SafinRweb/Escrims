import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const btnStyle = variant === 'danger'
        ? 'bg-red-600 hover:bg-red-700 text-white'
        : 'bg-yellow-600 hover:bg-yellow-700 text-black';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />

            {/* Modal */}
            <div className="relative bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
                <button onClick={onCancel} className="absolute top-4 right-4 text-gray-500 hover:text-white transition">
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-start gap-4 mb-6">
                    <div className={`p-3 rounded-xl shrink-0 ${variant === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{message}</p>
                    </div>
                </div>

                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-bold text-sm hover:bg-white/10 transition"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-5 py-2.5 rounded-xl font-bold text-sm transition shadow-lg ${btnStyle}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
