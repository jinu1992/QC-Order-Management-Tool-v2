import React, { useState } from 'react';
import { User } from '../types';
import { saveOrderNote } from '../services/api';
import { MessageIcon, SendIcon, UserIcon, ClockIcon, RefreshIcon } from './icons/Icons';

interface OrderNotesTimelineProps {
    poNumber: string;
    notesString?: string;
    currentUser: User | null;
    onNoteAdded: () => void;
}

const OrderNotesTimeline: React.FC<OrderNotesTimelineProps> = ({ poNumber, notesString, currentUser, onNoteAdded }) => {
    const [newNote, setNewNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Parse notes: "[2024-03-27 15:00] Admin: Note 1 ## [2024-03-27 15:10] User: Note 2"
    const notes = (notesString || '').split(' ## ').filter(n => n.trim() !== '').reverse();

    const handleAddNote = async () => {
        if (!newNote.trim() || !currentUser) return;
        
        setIsSubmitting(true);
        try {
            const result = await saveOrderNote(poNumber, newNote.trim(), currentUser.name);
            if (result.status === 'success') {
                setNewNote('');
                onNoteAdded(); // Trigger refresh
            } else {
                alert('Failed to add note: ' + result.message);
            }
        } catch (error) {
            alert('Error adding note');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <MessageIcon className="h-5 w-5 text-indigo-600" />
                    Order Remarks & Timeline
                </h3>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full uppercase">
                    ID: {poNumber}
                </span>
            </div>

            {/* Timeline View */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white custom-scrollbar">
                {notes.length > 0 ? (
                    notes.map((note, idx) => {
                        // Extract [Timestamp] User: Content
                        const match = note.match(/^\[(.*?)\] (.*?): (.*)$/);
                        const timestamp = match ? match[1] : '';
                        const user = match ? match[2] : 'System';
                        const content = match ? match[3] : note;

                        return (
                            <div key={idx} className="relative pl-8 group">
                                {/* Connector Line */}
                                {idx !== notes.length - 1 && (
                                    <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-gray-100 group-hover:bg-indigo-100 transition-colors"></div>
                                )}
                                
                                {/* Timeline Dot */}
                                <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center shadow-sm z-10 group-hover:scale-110 transition-transform">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                </div>

                                <div className="bg-gray-50 rounded-xl p-4 border border-transparent hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                                                <UserIcon className="h-3.5 w-3.5 text-indigo-600" />
                                            </div>
                                            <span className="text-xs font-bold text-gray-900">{user}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                                            <ClockIcon className="h-3 w-3" />
                                            {timestamp}
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</p>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <MessageIcon className="h-8 w-8 text-gray-300" />
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No remarks yet</p>
                        <p className="text-xs text-gray-400 mt-1">Be the first to add a note to this order.</p>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-gray-50 border-t border-gray-100">
                <div className="relative">
                    <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Type a new remark here..."
                        disabled={isSubmitting}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none min-h-[80px] custom-scrollbar"
                    />
                    <button
                        onClick={handleAddNote}
                        disabled={!newNote.trim() || isSubmitting}
                        className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <RefreshIcon className="h-4 w-4 animate-spin" />
                        ) : (
                            <>
                                <span className="text-xs font-bold px-1">Post Note</span>
                                <SendIcon className="h-4 w-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OrderNotesTimeline;
