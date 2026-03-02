
import React, { useState, useEffect, useRef } from 'react';
import { User, UploadMetadata } from '../types';
import { 
    CloudDownloadIcon as FileIcon, 
    ExternalLinkIcon, 
    InfoIcon, 
    XCircleIcon, 
    CheckCircleIcon, 
    RefreshIcon, 
    PaperclipIcon,
    AlertIcon,
    TruckIcon,
    GlobeIcon
} from './icons/Icons';
import { logFileUpload, fetchUploadMetadata } from '../services/api';

// Reusing AlertIcon if available, or using XCircleIcon as a fallback for the dialog
const ErrorDialog: React.FC<{ title: string, message: string, onClose: () => void }> = ({ title, message, onClose }) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-red-100 transform animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-red-50 border-b border-red-100 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <XCircleIcon className="h-10 w-10 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-red-900">{title}</h3>
            </div>
            <div className="p-8 text-center">
                <p className="text-gray-600 leading-relaxed mb-8">{message}</p>
                <button 
                    onClick={onClose}
                    className="w-full py-4 bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98]"
                >
                    Acknowledge Error
                </button>
            </div>
        </div>
    </div>
);

interface FileUploaderProps {
    currentUser: User;
    addLog: (action: string, details: string) => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ currentUser, addLog, addNotification }) => {
    const [uploadHistory, setUploadHistory] = useState<UploadMetadata[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [errorDetails, setErrorDetails] = useState<{ title: string, message: string } | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const uploadFunctions = [
        {
            id: 'b2b-packing-list',
            name: 'B2B Packing List Data',
            link: 'https://app.easyecom.io/V2/reports/reports-HomePage',
            instructions: "Go to 'B2B Packing List Report' in Other Reports section and Download last 7 days file.",
            accept: '.csv, .xlsx',
            validExtensions: ['.csv', '.xlsx']
        },
        {
            id: 'flipkart-minutes-po',
            name: 'FlipkartMinutes PO Upload',
            link: 'https://seller.flipkart.com/',
            instructions: "Upload the PO file (.xls only) downloaded from the Flipkart Minutes portal. The system backend will process this data into the PO database.",
            accept: '.xls',
            validExtensions: ['.xls']
        },
        {
            id: 'amazon-b2b-shipment',
            name: 'Amazon B2B Shipment',
            link: 'https://sellercentral.amazon.in/',
            instructions: "Upload the Amazon B2B shipment CSV file. The system will extract Shipment IDs and FC IDs to update the PO Repository.",
            accept: '.csv',
            validExtensions: ['.csv']
        }
    ];

    const loadMetadata = async () => {
        setIsLoadingMetadata(true);
        try {
            const data = await fetchUploadMetadata();
            setUploadHistory(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingMetadata(false);
        }
    };

    useEffect(() => {
        loadMetadata();
    }, []);

    const handleUploadClick = (funcId: string) => {
        setSelectedFunction(funcId);
        setPendingFile(null);
        setIsModalOpen(true);
    };

    const triggerError = (title: string, message: string) => {
        addNotification(message, 'error');
        setErrorDetails({ title, message });
    };

    const handleFileSelection = (file: File) => {
        if (!selectedFunction) return;

        const func = uploadFunctions.find(f => f.id === selectedFunction);
        if (!func) return;

        // Validation for specific file formats
        const fileName = file.name.toLowerCase();
        const isValid = func.validExtensions.some(ext => fileName.endsWith(ext));

        if (!isValid) {
            triggerError(
                'Invalid File Format', 
                `The ${func.name} section only accepts ${func.accept} files. You attempted to upload: ${file.name}`
            );
            return;
        }

        setPendingFile(file);
    };

    const confirmAndProcessUpload = async () => {
        if (!selectedFunction || !pendingFile) return;

        const file = pendingFile;
        setIsUploading(true);
        try {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target?.result?.toString().split(',')[1];
                    const res = await logFileUpload(selectedFunction, currentUser.email, base64Data, file.name);
                    
                    if (res.status === 'success') {
                        addLog('File Upload', `Successfully uploaded ${file.name} for ${selectedFunction}`);
                        addNotification(`File "${file.name}" processed successfully by backend.`, 'success');
                        setPendingFile(null);
                        setIsModalOpen(false);
                        loadMetadata();
                    } else {
                        triggerError('Server Processing Error', res.message || 'The server encountered an error while processing the file data.');
                    }
                } catch (err) {
                    triggerError('Network Error', 'Failed to communicate with the processing server. Please check your connection.');
                } finally {
                    setIsUploading(false);
                }
            };

            reader.onerror = () => {
                triggerError('File Access Error', 'System could not read the local file. It might be in use by another application.');
                setIsUploading(false);
            };

            reader.readAsDataURL(file);
        } catch (e) {
            triggerError('Initialization Error', 'An unexpected error occurred while starting the upload process.');
            setIsUploading(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isUploading) setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        if (isUploading) return;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelection(files[0]);
        }
    };

    const getMetadata = (funcId: string) => uploadHistory.find(h => h.id === funcId);

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 flex-1">
            {errorDetails && (
                <ErrorDialog 
                    title={errorDetails.title} 
                    message={errorDetails.message} 
                    onClose={() => setErrorDetails(null)} 
                />
            )}

            <header className="mb-8">
                <h1 className="text-2xl font-bold text-gray-800">System Data File Uploader</h1>
                <p className="text-gray-500 mt-1">Manual synchronization hub for reports and channel data.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {uploadFunctions.map(func => {
                    const meta = getMetadata(func.id);
                    return (
                        <div key={func.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow overflow-hidden">
                            <div className="p-6 flex-1">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`p-2.5 rounded-xl ${func.id.includes('amazon') ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                        {func.id.includes('amazon') ? <GlobeIcon className="h-6 w-6" /> : <FileIcon className="h-6 w-6" />}
                                    </div>
                                    <h3 className="font-bold text-gray-900">{func.name}</h3>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Last Sync Status</p>
                                        {meta ? (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                                    <span className="text-xs font-bold text-gray-700">{meta.lastUploadedBy.split('@')[0]}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-400 font-medium italic">{meta.lastUploadedAt}</span>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic">No previous uploads found.</p>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <a href={func.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                                            <span>Open Portal Source</span>
                                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                                        </a>
                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2">
                                            <InfoIcon className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-amber-800 leading-relaxed">
                                                <span className="font-bold uppercase text-[9px] block mb-0.5">Instructions</span>
                                                {func.instructions}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-gray-50 border-t border-gray-100">
                                <button 
                                    onClick={() => handleUploadClick(func.id)}
                                    className={`w-full flex items-center justify-center gap-2 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] ${
                                        func.id.includes('amazon') 
                                        ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' 
                                        : 'bg-partners-green hover:bg-green-700 shadow-green-100'
                                    }`}
                                >
                                    <FileIcon className="h-4 w-4" />
                                    Upload New Data
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isModalOpen && selectedFunction && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Upload Data File</h3>
                                <p className="text-xs text-gray-500 font-medium">Processing: {uploadFunctions.find(f => f.id === selectedFunction)?.name}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-gray-400"/></button>
                        </div>
                        
                        <div className="p-8">
                            {!pendingFile ? (
                                <>
                                    <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
                                        <InfoIcon className="h-5 w-5 text-blue-500 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-1">Required Steps</p>
                                            <p className="text-xs text-blue-800 leading-relaxed">
                                                {uploadFunctions.find(f => f.id === selectedFunction)?.instructions}
                                            </p>
                                        </div>
                                    </div>

                                    <label 
                                        onDragOver={onDragOver}
                                        onDragLeave={onDragLeave}
                                        onDrop={onDrop}
                                        className={`group relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-3xl cursor-pointer transition-all overflow-hidden ${
                                            isDragging 
                                                ? 'bg-partners-light-green border-partners-green scale-[1.02] shadow-xl' 
                                                : 'bg-gray-50 border-gray-300 hover:bg-gray-100 hover:border-partners-green'
                                        }`}
                                    >
                                        <div className={`flex flex-col items-center justify-center pt-5 pb-6 transition-transform ${isDragging ? 'scale-110' : ''}`}>
                                            <PaperclipIcon className={`h-14 w-14 mb-3 transition-all ${
                                                isDragging ? 'text-partners-green animate-bounce' : 'text-gray-400 group-hover:text-partners-green group-hover:scale-110'
                                            }`} />
                                            <p className="mb-2 text-sm font-bold text-gray-700">
                                                {isDragging ? 'Release to upload' : 'Click to select or drag and drop'}
                                            </p>
                                            <p className="text-xs text-gray-500 px-4 text-center">
                                                Accepts: <span className="font-bold text-partners-green">{uploadFunctions.find(f => f.id === selectedFunction)?.accept}</span> (Max. 10MB)
                                            </p>
                                        </div>
                                        <input 
                                            type="file" 
                                            className="hidden" 
                                            accept={uploadFunctions.find(f => f.id === selectedFunction)?.accept || '.csv, .xlsx, .xls'}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleFileSelection(file);
                                            }}
                                            disabled={isUploading}
                                        />
                                    </label>
                                </>
                            ) : (
                                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="bg-partners-light-green border border-partners-green/20 rounded-2xl p-6 flex items-center gap-4">
                                        <div className="p-3 bg-partners-green text-white rounded-xl shadow-lg shadow-green-100">
                                            <PaperclipIcon className="h-8 w-8" />
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-sm font-bold text-gray-900 truncate" title={pendingFile.name}>{pendingFile.name}</p>
                                            <p className="text-xs text-gray-500 font-medium">{formatFileSize(pendingFile.size)} • Ready to process</p>
                                        </div>
                                        <button 
                                            onClick={() => setPendingFile(null)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Change File"
                                        >
                                            <XCircleIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                                        <InfoIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                            Please verify that you have selected the correct file. Once confirmed, the system will begin parsing and updating the central database.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button 
                                            onClick={confirmAndProcessUpload}
                                            disabled={isUploading}
                                            className="w-full flex items-center justify-center gap-2 py-4 bg-partners-green text-white font-bold rounded-2xl shadow-xl shadow-green-100 hover:bg-green-700 transition-all active:scale-[0.98] disabled:opacity-50"
                                        >
                                            {isUploading ? (
                                                <>
                                                    <RefreshIcon className="h-5 w-5 animate-spin" />
                                                    <span>Processing File...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircleIcon className="h-5 w-5" />
                                                    <span>Confirm and Process Upload</span>
                                                </>
                                            )}
                                        </button>
                                        <button 
                                            onClick={() => setPendingFile(null)}
                                            disabled={isUploading}
                                            className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                                        >
                                            Cancel and select another file
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-8 flex items-center justify-center gap-2 pt-4 border-t border-gray-50">
                                <CheckCircleIcon className="h-4 w-4 text-partners-green" />
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Validations strictly applied</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileUploader;
