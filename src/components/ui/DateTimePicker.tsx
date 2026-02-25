import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ['00', '15', '30', '45'];
const AM_PM = ['AM', 'PM'];

function toLocalISOString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
}

function parseLocalISO(value: string): Date {
    if (!value) return new Date();
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
}

function formatDisplay(d: Date): string {
    const day = d.getDate();
    const month = MONTHS[d.getMonth()];
    let h = d.getHours();
    const m = d.getMinutes();
    const am = h < 12;
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    const mm = String(m).padStart(2, '0');
    return `${day} ${month}, ${h}:${mm} ${am ? 'AM' : 'PM'}`;
}

interface DateTimePickerProps {
    value: string; // YYYY-MM-DDTHH:MM or ''
    onChange: (value: string) => void;
    placeholder?: string;
    id?: string;
}

export default function DateTimePicker({ value, onChange, placeholder = 'Set Match Date & Time', id }: DateTimePickerProps) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const hasValue = !!value?.trim();
    const initial = hasValue ? parseLocalISO(value) : new Date();
    const [date, setDate] = useState<Date>(() => initial);
    const [hour, setHour] = useState(() => initial.getHours() % 12 || 12);
    const [minute, setMinute] = useState(() => Math.round(initial.getMinutes() / 15) * 15);
    const [amPm, setAmPm] = useState<'AM' | 'PM'>(() => (initial.getHours() < 12 ? 'AM' : 'PM'));

    useEffect(() => {
        if (!open) return;
        const d = hasValue ? parseLocalISO(value) : new Date();
        setDate(d);
        setHour(d.getHours() % 12 || 12);
        setMinute(Math.round(d.getMinutes() / 15) * 15);
        setAmPm(d.getHours() < 12 ? 'AM' : 'PM');
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setPosition({ top: rect.bottom + 4, left: rect.left });
        }
    }, [open, value, hasValue]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                const target = e.target as HTMLElement;
                if (!target.closest('[data-datetime-popover]')) setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const applyTime = () => {
        let h = hour;
        if (amPm === 'PM' && h !== 12) h += 12;
        if (amPm === 'AM' && h === 12) h = 0;
        const next = new Date(date);
        next.setHours(h, minute, 0, 0);
        onChange(toLocalISOString(next));
        setOpen(false);
    };

    const setToday = () => {
        const today = new Date();
        setDate(today);
        setHour(today.getHours() % 12 || 12);
        setMinute(Math.round(today.getMinutes() / 15) * 15);
        setAmPm(today.getHours() < 12 ? 'AM' : 'PM');
    };

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);

    const popoverContent = open ? (
        <div
            data-datetime-popover
            className="fixed w-[320px] rounded-xl border border-white/10 bg-neutral-900 shadow-xl overflow-hidden z-[9999]"
            style={{ top: position.top, left: position.left }}
        >
            <div className="p-4 bg-white/5 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">
                        {MONTHS[month]} {year}
                    </span>
                    <button
                        type="button"
                        onClick={setToday}
                        className="text-xs font-bold text-accent hover:underline"
                    >
                        Today
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <span key={i} className="text-[10px] text-gray-500 font-bold py-1">
                            {d}
                        </span>
                    ))}
                    {days.map((d, i) =>
                        d === null ? (
                            <span key={`e-${i}`} />
                        ) : (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDate(new Date(year, month, d))}
                                className={`w-8 h-8 rounded-lg text-sm font-medium transition ${date.getDate() === d && date.getMonth() === month
                                        ? 'bg-accent text-black'
                                        : 'text-gray-300 hover:bg-white/10'
                                    }`}
                            >
                                {d}
                            </button>
                        )
                    )}
                </div>
            </div>

            <div className="p-4 border-b border-white/10">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-accent" /> Time
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={hour}
                        onChange={(e) => setHour(Number(e.target.value))}
                        className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        style={{ colorScheme: 'dark' }}
                    >
                        {HOURS_12.map((h) => (
                            <option key={h} value={h} className="bg-neutral-900 text-white">
                                {h}
                            </option>
                        ))}
                    </select>
                    <span className="text-gray-500 font-bold">:</span>
                    <select
                        value={minute}
                        onChange={(e) => setMinute(Number(e.target.value))}
                        className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        style={{ colorScheme: 'dark' }}
                    >
                        {MINUTES.map((m) => (
                            <option key={m} value={parseInt(m, 10)} className="bg-neutral-900 text-white">
                                {m}
                            </option>
                        ))}
                    </select>
                    <select
                        value={amPm}
                        onChange={(e) => setAmPm(e.target.value as 'AM' | 'PM')}
                        className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        style={{ colorScheme: 'dark' }}
                    >
                        {AM_PM.map((a) => (
                            <option key={a} value={a} className="bg-neutral-900 text-white">
                                {a}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-3 flex justify-end gap-2 bg-black/20">
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg border border-white/10 hover:bg-white/5"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={applyTime}
                    className="px-4 py-1.5 text-sm font-bold bg-accent text-black rounded-lg hover:bg-accent/90"
                >
                    Apply
                </button>
            </div>
        </div>
    ) : null;

    return (
        <div ref={ref} className="relative" id={id}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-left text-sm hover:border-white/20 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition min-h-[36px]"
            >
                <Calendar className={`w-4 h-4 shrink-0 ${hasValue ? 'text-accent' : 'text-gray-500'}`} />
                <Clock className={`w-4 h-4 shrink-0 ${hasValue ? 'text-accent' : 'text-gray-500'}`} />
                <span className={hasValue ? 'font-medium text-white' : 'text-gray-500'}>
                    {hasValue ? formatDisplay(parseLocalISO(value)) : placeholder}
                </span>
            </button>
            {popoverContent && createPortal(popoverContent, document.body)}
        </div>
    );
}
