import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { PurchaseOrder, POItem, User, GroupedSalesOrder, POStatus } from '../types';
import { TruckIcon, SearchIcon, AlertIcon, CheckCircleIcon, CalendarIcon, FilterIcon, ChatIcon, ChevronDownIcon, ChevronUpIcon, MessageIcon, PlusIcon, PaperclipIcon, ExternalLinkIcon, RefreshIcon } from './icons/Icons';
import OrderNotesTimeline from './OrderNotesTimeline';
import AppointmentUpdateModal from './AppointmentUpdateModal';
import { logFileUpload, updateShipmentDocuments, fetchLocalDownloads, readLocalFile, fetchBotSessions, refreshBotSession, getBotSessionRefreshStatus, runPortalBot } from '../services/api';

// GroupedSalesOrder is now imported from ../types


interface ShipmentManagerProps {
    purchaseOrders: PurchaseOrder[];
    currentUser?: User | null;
    setPurchaseOrders?: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
    addNotification?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

// Helper to safely format dates and suppress the 1899 Excel epoch bug
const formatSafeDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return ''; }
};

const formatSafeTime = (timeStr?: string): string => {
    if (!timeStr) return '';
    // If it looks like an ISO string with 1899, suppress it
    if (timeStr.includes('1899')) return '';
    // If it's already a short time like "10:30 AM", return as-is
    if (/^\d{1,2}:\d{2}/.test(timeStr) && !timeStr.includes('T')) return timeStr;
    try {
        const d = new Date(timeStr);
        if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return ''; }
};

const ShipmentManager: React.FC<ShipmentManagerProps> = ({ purchaseOrders, currentUser, setPurchaseOrders, addNotification }: ShipmentManagerProps) => {
    const isCloudEnv = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [awbSearch, setAwbSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'All' | 'Today' | 'Tomorrow' | 'Missed' | 'RTO' | 'Delivered' | 'GRN_PO_Upload'>('All');
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [apptUpdateModal, setApptUpdateModal] = useState<{ isOpen: boolean, so: GroupedSalesOrder | null }>({ isOpen: false, so: null });

    // Local files and upload state
    const [localFiles, setLocalFiles] = useState<{ name: string, path: string, folder: string }[]>([]);
    const [isLocalServerConnected, setIsLocalServerConnected] = useState<boolean | null>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [uploadingPoId, setUploadingPoId] = useState<string | null>(null);
    const [uploadingGrnId, setUploadingGrnId] = useState<string | null>(null);
    const [savingGrnNumberId, setSavingGrnNumberId] = useState<string | null>(null);
    const [grnNumberInputs, setGrnNumberInputs] = useState<Record<string, string>>({});
    const [autoUploadingId, setAutoUploadingId] = useState<string | null>(null);
    const [isBatchUploading, setIsBatchUploading] = useState(false);

    // Bot Session health and run states
    const [sessionStatuses, setSessionStatuses] = useState<any[]>([]);
    const [isCheckingSessions, setIsCheckingSessions] = useState(false);
    const [refreshingPortal, setRefreshingPortal] = useState<string | null>(null);
    const [refreshMessage, setRefreshMessage] = useState<string>('');
    const [runningBots, setRunningBots] = useState<Record<string, boolean>>({});

    // Fetch all portal session health statuses
    const checkAllSessions = async () => {
        setIsCheckingSessions(true);
        try {
            const res = await fetchBotSessions();
            if (res.status === 'success' && res.results) {
                setSessionStatuses(res.results);
                setIsLocalServerConnected(true);
            } else {
                setIsLocalServerConnected(false);
                if (!isCloudEnv) {
                    addNotification?.('Failed to fetch bot sessions status.', 'error');
                }
            }
        } catch (err: any) {
            setIsLocalServerConnected(false);
            if (!isCloudEnv) {
                addNotification?.(err.message || 'Error checking session statuses.', 'error');
            }
        } finally {
            setIsCheckingSessions(false);
        }
    };

    // Run browser automation script for a portal
    const triggerPortalBotRun = async (portalId: string) => {
        setRunningBots(prev => ({ ...prev, [portalId]: true }));
        try {
            const res = await runPortalBot(portalId);
            if (res.status === 'success') {
                addNotification?.(`Triggered bot script for ${portalId}. Browser opened on host desktop.`, 'success');
            } else {
                addNotification?.(res.message || `Failed to run bot for ${portalId}.`, 'error');
            }
        } catch (err: any) {
            addNotification?.(err.message || `Error running bot for ${portalId}.`, 'error');
        } finally {
            setRunningBots(prev => ({ ...prev, [portalId]: false }));
        }
    };

    // Trigger session refresh (opens headful browser on host desktop)
    const triggerSessionRefresh = async (portalId: string) => {
        setRefreshingPortal(portalId);
        setRefreshMessage('Launching browser...');
        try {
            const res = await refreshBotSession(portalId);
            if (res.status === 'success') {
                addNotification?.(`Session refresh started for ${portalId}. Please log in in the opened browser.`, 'info');
                // Start polling status
                pollRefreshJob(portalId);
            } else {
                addNotification?.(res.message || 'Failed to start session refresh.', 'error');
                setRefreshingPortal(null);
            }
        } catch (err: any) {
            addNotification?.(err.message || 'Error starting session refresh.', 'error');
            setRefreshingPortal(null);
        }
    };

    // Poll current active refresh job status
    const pollRefreshJob = (portalId: string) => {
        const timer = setInterval(async () => {
            try {
                const res = await getBotSessionRefreshStatus(portalId);
                if (res.status === 'success' && res.job) {
                    const job = res.job;
                    setRefreshMessage(job.message || '');
                    
                    if (job.status === 'completed') {
                        clearInterval(timer);
                        setRefreshingPortal(null);
                        setRefreshMessage('');
                        addNotification?.(`Successfully refreshed session for ${portalId}!`, 'success');
                        checkAllSessions();
                    } else if (job.status === 'failed') {
                        clearInterval(timer);
                        setRefreshingPortal(null);
                        setRefreshMessage('');
                        addNotification?.(`Session refresh failed for ${portalId}: ${job.message}`, 'error');
                        checkAllSessions();
                    }
                }
            } catch (err) {
                console.error("Error polling refresh job status:", err);
            }
        }, 2500);
    };

    // Scan local downloads folder
    const scanLocalFiles = async () => {
        setIsScanning(true);
        try {
            const res = await fetchLocalDownloads();
            if (res.status === 'success' && res.data) {
                setLocalFiles(res.data);
                setIsLocalServerConnected(true);
                addNotification?.(`Scanned local downloads folder. Found ${res.data.length} files.`, 'success');
            } else {
                setIsLocalServerConnected(false);
                addNotification?.('Failed to scan local downloads folder.', 'error');
            }
        } catch (e: any) {
            setIsLocalServerConnected(false);
            if (isCloudEnv) {
                addNotification?.('Failed to connect to local desktop server. Please check if "npm run dev" is running locally.', 'error');
            } else {
                addNotification?.(e.message || 'Error scanning local downloads.', 'error');
            }
        } finally {
            setIsScanning(false);
        }
    };

    // Trigger scanning when activeTab is GRN_PO_Upload
    useEffect(() => {
        if (activeTab === 'GRN_PO_Upload') {
            scanLocalFiles();
            checkAllSessions();
        }
    }, [activeTab]);

    // Local files auto-detection match logic
    const findLocalMatches = useCallback((poReferenceStr: string) => {
        const poRefs = String(poReferenceStr || '').split(',').map(s => s.trim()).filter(Boolean);
        let poMatch: typeof localFiles[0] | undefined;
        let grnMatch: typeof localFiles[0] | undefined;

        for (const poNum of poRefs) {
            if (!poNum) continue;
            const poNumLower = poNum.toLowerCase();

            for (const file of localFiles) {
                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes(poNumLower)) {
                    const isInPoFolder = file.folder.toLowerCase() === 'po pdfs';
                    const isInInvoicesFolder = file.folder.toLowerCase() === 'invoices';
                    const hasPoInName = fileNameLower.includes('po');
                    const hasGrnInName = fileNameLower.includes('grn') || fileNameLower.includes('pod') || fileNameLower.includes('invoice') || fileNameLower.includes('inv') || fileNameLower.includes('receipt');

                    // Classification heuristic
                    if (isInPoFolder || (hasPoInName && !hasGrnInName)) {
                        if (!poMatch) poMatch = file;
                    } else if (isInInvoicesFolder || hasGrnInName) {
                        if (!grnMatch) grnMatch = file;
                    } else {
                        if (!poMatch) poMatch = file;
                    }
                }
            }
        }

        return { poMatch, grnMatch };
    }, [localFiles]);

    // Auto upload a local matched file
    const handleAutoUpload = async (
        poReferenceStr: string,
        soId: string,
        docType: 'PO' | 'GRN',
        localPath: string,
        localName: string
    ) => {
        const poRefs = String(poReferenceStr || '').split(',').map(s => s.trim()).filter(Boolean);
        const poNumber = poRefs[0] || poReferenceStr;

        if (docType === 'PO') setUploadingPoId(soId);
        else setUploadingGrnId(soId);

        try {
            // 1. Read local file as base64
            const fileDataRes = await readLocalFile(localPath);
            if (fileDataRes.status !== 'success' || !fileDataRes.fileData) {
                addNotification?.(`Failed to read local file: ${localName}`, 'error');
                return null;
            }

            // 2. Upload file to Google Drive
            const uploadType = docType === 'PO' ? 'po-pdf' : 'pod-image';
            const email = currentUser?.email || 'System';
            const uploadRes = await logFileUpload(uploadType, email, fileDataRes.fileData, localName);

            if (uploadRes.status === 'success' && uploadRes.fileUrl) {
                const fileUrl = uploadRes.fileUrl;

                // 3. Save link to spreadsheet PO Database
                const updateRes = await updateShipmentDocuments({
                    poNumber,
                    poPdfUrl: docType === 'PO' ? fileUrl : undefined,
                    podImageUrl: docType === 'GRN' ? fileUrl : undefined
                });

                if (updateRes.status === 'success') {
                    if (setPurchaseOrders) {
                        setPurchaseOrders(prev => prev.map(p => {
                            if (p.poNumber === poNumber) {
                                return {
                                    ...p,
                                    poPdfUrl: docType === 'PO' ? fileUrl : p.poPdfUrl,
                                    podImageUrl: docType === 'GRN' ? fileUrl : p.podImageUrl,
                                    status: docType === 'GRN' ? POStatus.GRNUpdated : p.status
                                };
                            }
                            return p;
                        }));
                    }
                    addNotification?.(`Auto-uploaded local file ${localName} successfully as ${docType} file.`, 'success');
                    return fileUrl;
                } else {
                    addNotification?.(updateRes.message || 'Failed to update sheet database.', 'error');
                }
            } else {
                addNotification?.(uploadRes.message || 'Failed to upload file to storage.', 'error');
            }
        } catch (err: any) {
            addNotification?.(err.message || 'Error during auto-upload.', 'error');
        } finally {
            if (docType === 'PO') setUploadingPoId(null);
            else setUploadingGrnId(null);
        }
        return null;
    };

    // Batch upload all matches
    const handleBatchAutoUpload = async () => {
        setIsBatchUploading(true);
        let uploadCount = 0;

        try {
            for (const so of trackingOrders) {
                const { poMatch, grnMatch } = findLocalMatches(so.poReference);
                const poRefs = String(so.poReference || '').split(',').map(s => s.trim()).filter(Boolean);
                const poNumber = poRefs[0];
                if (!poNumber) continue;

                if (!so.poPdfUrl && poMatch) {
                    setAutoUploadingId(so.id);
                    const uploaded = await handleAutoUpload(so.poReference, so.id, 'PO', poMatch.path, poMatch.name);
                    if (uploaded) uploadCount++;
                }

                if (!so.podImageUrl && grnMatch) {
                    setAutoUploadingId(so.id);
                    const uploaded = await handleAutoUpload(so.poReference, so.id, 'GRN', grnMatch.path, grnMatch.name);
                    if (uploaded) uploadCount++;
                }
            }

            if (uploadCount > 0) {
                addNotification?.(`Batch auto-upload complete! Successfully uploaded ${uploadCount} documents.`, 'success');
            } else {
                addNotification?.('No matching files found to auto-upload.', 'info');
            }
        } catch (e: any) {
            addNotification?.(e.message || 'Error during batch auto-upload.', 'error');
        } finally {
            setAutoUploadingId(null);
            setIsBatchUploading(false);
        }
    };

    // Manual upload fallback logic
    const handleManualDocumentUpload = async (
        file: File,
        poReferenceStr: string,
        soId: string,
        docType: 'PO' | 'GRN'
    ) => {
        const poRefs = String(poReferenceStr || '').split(',').map(s => s.trim()).filter(Boolean);
        const poNumber = poRefs[0] || poReferenceStr;

        if (docType === 'PO') setUploadingPoId(soId);
        else setUploadingGrnId(soId);

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target?.result?.toString().split(',')[1];
                    if (!base64Data) {
                        addNotification?.('Failed to read file.', 'error');
                        return;
                    }

                    const uploadType = docType === 'PO' ? 'po-pdf' : 'pod-image';
                    const email = currentUser?.email || 'System';
                    const uploadRes = await logFileUpload(uploadType, email, base64Data, file.name);

                    if (uploadRes.status === 'success' && uploadRes.fileUrl) {
                        const fileUrl = uploadRes.fileUrl;

                        const updateRes = await updateShipmentDocuments({
                            poNumber,
                            poPdfUrl: docType === 'PO' ? fileUrl : undefined,
                            podImageUrl: docType === 'GRN' ? fileUrl : undefined
                        });

                        if (updateRes.status === 'success') {
                            if (setPurchaseOrders) {
                                setPurchaseOrders(prev => prev.map(p => {
                                    if (p.poNumber === poNumber) {
                                        return {
                                            ...p,
                                            poPdfUrl: docType === 'PO' ? fileUrl : p.poPdfUrl,
                                            podImageUrl: docType === 'GRN' ? fileUrl : p.podImageUrl,
                                            status: docType === 'GRN' ? POStatus.GRNUpdated : p.status
                                        };
                                    }
                                    return p;
                                }));
                            }
                            addNotification?.(`${docType} file uploaded manually.`, 'success');
                        } else {
                            addNotification?.(updateRes.message || 'Failed to update sheet database.', 'error');
                        }
                    } else {
                        addNotification?.(uploadRes.message || 'Failed to upload file.', 'error');
                    }
                } catch (err: any) {
                    addNotification?.(err.message || 'Error during manual upload.', 'error');
                } finally {
                    if (docType === 'PO') setUploadingPoId(null);
                    else setUploadingGrnId(null);
                }
            };
            reader.readAsDataURL(file);
        } catch (e) {
            addNotification?.('Failed to read file.', 'error');
            if (docType === 'PO') setUploadingPoId(null);
            else setUploadingGrnId(null);
        }
    };

    // Save GRN Number and GRN Date (today)
    const handleSaveGrnNumber = async (poReferenceStr: string, soId: string) => {
        const poRefs = String(poReferenceStr || '').split(',').map(s => s.trim()).filter(Boolean);
        const poNumber = poRefs[0] || poReferenceStr;
        const inputVal = grnNumberInputs[soId];
        if (inputVal === undefined) return;

        setSavingGrnNumberId(soId);
        try {
            const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const res = await updateShipmentDocuments({
                poNumber,
                grnNumber: inputVal,
                grnDate: todayStr
            });

            if (res.status === 'success') {
                addNotification?.(`GRN number updated successfully for PO ${poNumber}.`, 'success');
                if (setPurchaseOrders) {
                    setPurchaseOrders(prev => prev.map(p => {
                        if (p.poNumber === poNumber) {
                            return {
                                ...p,
                                grnNumber: inputVal,
                                grnDate: todayStr,
                                status: POStatus.GRNUpdated
                            };
                        }
                        return p;
                    }));
                }
                setGrnNumberInputs(prev => {
                    const next = { ...prev };
                    delete next[soId];
                    return next;
                });
            } else {
                addNotification?.(res.message || 'Failed to update GRN number.', 'error');
            }
        } catch (err: any) {
            addNotification?.(err.message || 'Error updating GRN number.', 'error');
        } finally {
            setSavingGrnNumberId(null);
        }
    };

    const todayDate = useMemo(() => new Date(), []);
    const tomorrowDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
    }, []);

    const parseAnyDate = (dateStr?: string): Date | null => {
        if (!dateStr || dateStr === 'N/A' || dateStr.trim() === '') return null;
        let d = new Date(dateStr);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;

        // Try parsing DD/MM/YYYY or DD-Mon-YYYY or DD-MM-YYYY
        const parts = dateStr.trim().split(/[\/\-\s]+/);
        if (parts.length === 3) {
            const monthMap: Record<string, number> = {
                jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
            };
            let day = parseInt(parts[0], 10);
            let month = isNaN(Number(parts[1])) ? monthMap[parts[1].toLowerCase().slice(0, 3)] : parseInt(parts[1], 10) - 1;
            let year = parseInt(parts[2], 10);

            // Handle YYYY-MM-DD format if year comes first
            if (parts[0].length === 4) {
                year = parseInt(parts[0], 10);
                month = isNaN(Number(parts[1])) ? monthMap[parts[1].toLowerCase().slice(0, 3)] : parseInt(parts[1], 10) - 1;
                day = parseInt(parts[2], 10);
            }

            if (!isNaN(day) && month !== undefined && !isNaN(month) && !isNaN(year) && year > 2000) {
                return new Date(year, month, day);
            }
        }
        return null;
    };

    const isSameDay = (dateStr: string | undefined, targetDate: Date) => {
        const d = parseAnyDate(dateStr);
        if (!d) return false;
        return d.toDateString() === targetDate.toDateString();
    };

    const getDaysAgo = (dateStr: string | undefined): number => {
        const d = parseAnyDate(dateStr);
        if (!d) return 0;
        const today = new Date();
        const diffMs = today.getTime() - d.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    };

    const isPastDate = (dateStr: string | undefined, compareDate: Date) => {
        const d = parseAnyDate(dateStr);
        if (!d) return false;
        const d1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const compare = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
        return d1 < compare;
    };

    // 1. Group the raw purchaseOrders to match SalesOrderTable logic
    const allSalesOrders = useMemo(() => {
        const groups: Record<string, GroupedSalesOrder> = {};

        purchaseOrders.forEach((po: PurchaseOrder) => {
            (po.items || []).forEach((item: POItem) => {
                const rawRef = item.eeReferenceCode;
                if (!rawRef || String(rawRef).trim() === "") return;
                const refCode = String(rawRef).trim();

                const effectiveQty = item.shippedQuantity || 0;
                const effectiveLineAmount = effectiveQty * (item.unitCost || 0);

                const eeBoxCount = Number(item.eeBoxCount || 0);
                const carrier = item.carrier || po.carrier;
                const awb = item.awb || po.awb;
                const trackingStatus = item.trackingStatus || po.trackingStatus;
                const trackingUrl = item.trackingUrl || po.trackingUrl;

                const batchDate = item.eeBatchCreatedAt || po.eeBatchCreatedAt;
                const invNum = item.invoiceNumber;
                const hasInvoice = !!invNum && invNum !== 'GENERATING...';

                const isAmazon = po.channel.toLowerCase().includes('amazon');
                const isAmazonFbaYeio = (po.channel.toLowerCase().includes('amazon_fba') || po.channel.toLowerCase().includes('amazon fba')) &&
                    (po.storeCode.toUpperCase() === 'YEIO');
                const statusHasInvoice = hasInvoice || isAmazonFbaYeio;

                const maniDate = item.eeManifestDate || po.eeManifestDate;
                const eeStatus = (item.eeOrderStatus || po.eeOrderStatus || 'Processing').trim();
                const eeStatusLower = eeStatus.toLowerCase();

                const effectiveOrderDate = item.eeOrderDate || po.eeOrderDate || 'N/A';

                let displayStatus = 'Processing';

                const trackingStatusLower = (trackingStatus || '').toLowerCase();
                const isOutOfDelivery = trackingStatusLower === 'out for delivery';
                const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!item.deliveredDate || !!po.deliveredDate);
                const isDeliveredStatus = isActuallyDelivered && !isOutOfDelivery;

                const rtoStatus = item.rtoStatus || po.rtoStatus;
                const isRTOInitiated = eeStatusLower === 'shipped' && rtoStatus;

                if (eeStatusLower === 'returned' || eeStatusLower === 'rto') displayStatus = 'Returned';
                else if (isRTOInitiated) displayStatus = 'RTO Initiated';
                else if (rtoStatus) displayStatus = 'Returned';
                else if (eeStatusLower === 'closed') displayStatus = 'Closed';
                else if (isDeliveredStatus) displayStatus = statusHasInvoice ? 'Delivered' : 'Batch Created';
                else if (eeStatusLower === 'shipped' || maniDate || trackingStatusLower === 'in transit' || isOutOfDelivery || (trackingStatusLower === 'booked' && eeStatusLower !== 'confirmed')) {
                    displayStatus = statusHasInvoice ? (isAmazon ? 'Delivered' : 'Shipped') : 'Batch Created';
                }
                else if (awb) displayStatus = statusHasInvoice ? 'Label Generated' : 'Batch Created';
                else if (statusHasInvoice) displayStatus = isAmazonFbaYeio && (eeStatusLower === 'shipped' || maniDate) ? 'Delivered' : 'Invoiced';
                else if (batchDate || eeStatusLower === 'picking' || eeStatusLower === 'batched') displayStatus = 'Batch Created';
                else if (eeStatusLower === 'confirmed' || eeStatusLower === 'open') displayStatus = 'Confirmed';

                const isZepto = po.channel.toLowerCase().includes('zepto');

                const apptDate = item.appointmentDate || po.appointmentDate;
                const apptId = item.appointmentId || po.appointmentId;
                const apptReqId = item.appointmentRequestId || po.appointmentRequestId;
                const apptReqDate = item.appointmentRequestDate || po.appointmentRequestDate;
                const apptReqTimestamp = item.appointmentRequestTimestamp || po.appointmentRequestTimestamp;

                if (isZepto && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated'].includes(displayStatus)) {
                    if (apptId) {
                    } else if (apptDate) {
                        displayStatus = 'Create ASN';
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                const isInstamart = po.channel.toLowerCase().includes('instamart');
                if (isInstamart && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated'].includes(displayStatus)) {
                    if (apptId || apptDate) {
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                const isBB = po.channel.toLowerCase().includes('bb');
                if (isBB && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated', 'Label Generated'].includes(displayStatus)) {
                    if (apptId || apptDate) {
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                if (!groups[refCode]) {
                    groups[refCode] = {
                        id: refCode,
                        poReference: String(po.id || ''),
                        status: displayStatus,
                        originalEeStatus: eeStatus,
                        channel: po.channel,
                        storeCode: po.storeCode,
                        orderDate: effectiveOrderDate,
                        poEdd: po.poEdd,
                        poExpiryDate: po.poExpiryDate,
                        poPdfUrl: po.poPdfUrl,
                        qty: 0,
                        amount: 0,
                        items: [],
                        batchCreatedAt: batchDate,
                        invoiceDate: item.invoiceDate,
                        manifestDate: maniDate,
                        invoiceId: item.invoiceId,
                        invoiceStatus: item.invoiceStatus,
                        invoiceNumber: invNum,
                        invoiceTotal: item.invoiceTotal,
                        invoiceUrl: item.invoiceUrl,
                        invoicePdfUrl: item.invoicePdfUrl,
                        carrier: carrier,
                        awb: awb,
                        trackingStatus: trackingStatus,
                        trackingUrl: trackingUrl,
                        edd: item.edd || po.edd,
                        latestStatus: item.latestStatus || po.latestStatus,
                        latestStatusDate: item.latestStatusDate || po.latestStatusDate,
                        currentLocation: item.currentLocation || po.currentLocation,
                        deliveredDate: item.deliveredDate || po.deliveredDate,
                        rtoStatus: item.rtoStatus || po.rtoStatus,
                        rtoAwb: item.rtoAwb || po.rtoAwb,
                        boxCount: eeBoxCount,
                        appointmentDate: item.appointmentDate || po.appointmentDate,
                        appointmentRequestDate: item.appointmentRequestDate || po.appointmentRequestDate,
                        appointmentRequestId: item.appointmentRequestId || po.appointmentRequestId,
                        appointmentRequestTimestamp: item.appointmentRequestTimestamp || po.appointmentRequestTimestamp,
                        appointmentId: item.appointmentId || po.appointmentId,
                        appointmentTime: po.appointmentTime,
                        appointmentRemarks: po.appointmentRemarks,
                        qrCodeUrl: po.qrCodeUrl,
                        ewb: item.ewb || po.ewb,
                        fbaShipmentId: item.fbaShipmentId || po.fbaShipmentId,
                        shippingCharge: po.shippingCharge,
                        eeCustomerId: po.eeCustomerId,
                        consignmentQty: po.consignmentQty,
                        consignmentProducts: po.consignmentProducts,
                        consignmentValue: po.consignmentValue,
                        pickupDate: item.pickupDate || po.pickupDate,
                        orderNotes: po.orderNotes || '',
                        podImageUrl: po.podImageUrl,
                        grnNumber: po.grnNumber,
                        grnDate: po.grnDate
                    };
                } else {
                    const curPo = String(po.id || '');
                    if (!groups[refCode].poReference.includes(curPo)) groups[refCode].poReference += `, ${curPo}`;
                    const statusRank = (s: string) => {
                        if (s === 'Returned') return 13;
                        if (s === 'RTO Initiated') return 12;
                        if (s === 'Closed') return 11;
                        if (s === 'Delivered') return 10;
                        if (s === 'Shipped') return 9;
                        if (s === 'Label Generated') return 8;
                        if (s === 'Create ASN') return 7;
                        if (s === 'Awaiting Appointment Confirmation') return 6;
                        if (s === 'Invoiced') return 4;
                        if (s === 'Batch Created') return 3;
                        if (s === 'Confirmed') return 2;
                        return 1;
                    };
                    if (statusRank(displayStatus) > statusRank(groups[refCode].status)) groups[refCode].status = displayStatus;
                    if (groups[refCode].orderDate === 'N/A' && effectiveOrderDate !== 'N/A') groups[refCode].orderDate = effectiveOrderDate;
                    if (!groups[refCode].batchCreatedAt) groups[refCode].batchCreatedAt = batchDate;
                    if (!groups[refCode].invoiceDate) groups[refCode].invoiceDate = item.invoiceDate;
                    if (!groups[refCode].manifestDate) groups[refCode].manifestDate = maniDate;
                    if (!groups[refCode].invoiceNumber) groups[refCode].invoiceNumber = invNum;

                    groups[refCode].boxCount = eeBoxCount;

                    if (!groups[refCode].awb && awb) groups[refCode].awb = awb;
                    if (!groups[refCode].trackingStatus && trackingStatus) groups[refCode].trackingStatus = trackingStatus;
                    if (!groups[refCode].trackingUrl && trackingUrl) groups[refCode].trackingUrl = trackingUrl;
                    if (!groups[refCode].ewb) groups[refCode].ewb = item.ewb || po.ewb;
                    if (!groups[refCode].fbaShipmentId) groups[refCode].fbaShipmentId = item.fbaShipmentId || po.fbaShipmentId;
                    if (!groups[refCode].appointmentId) groups[refCode].appointmentId = po.appointmentId;
                    if (!groups[refCode].qrCodeUrl) groups[refCode].qrCodeUrl = po.qrCodeUrl;
                    if (po.shippingCharge !== undefined) groups[refCode].shippingCharge = po.shippingCharge;
                    if (po.eeCustomerId) groups[refCode].eeCustomerId = po.eeCustomerId;
                    if (!groups[refCode].podImageUrl && po.podImageUrl) groups[refCode].podImageUrl = po.podImageUrl;
                    if (!groups[refCode].grnNumber && po.grnNumber) groups[refCode].grnNumber = po.grnNumber;
                    if (!groups[refCode].grnDate && po.grnDate) groups[refCode].grnDate = po.grnDate;
                    if (po.orderNotes && !groups[refCode].orderNotes?.includes(po.orderNotes)) {
                        groups[refCode].orderNotes = groups[refCode].orderNotes ? `${groups[refCode].orderNotes} ## ${po.orderNotes}` : po.orderNotes;
                    }
                }
                groups[refCode].items.push(item);
                groups[refCode].qty += effectiveQty;
                groups[refCode].amount += effectiveLineAmount;
            });
        });

        const results = Object.values(groups);

        results.forEach(so => {
            const hasInvoice = !!so.invoiceNumber && so.invoiceNumber !== 'GENERATING...';
            const progressRequiringInvoice = ['Label Generated', 'Shipped', 'Delivered'].includes(so.status);

            const isAmazonFbaYeio = (so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) &&
                (so.storeCode.toUpperCase() === 'YEIO');

            if (!hasInvoice && progressRequiringInvoice && !isAmazonFbaYeio) {
                so.status = 'Batch Created';
            }
        });

        return results;
    }, [purchaseOrders]);

    // Get unique channels from ALL shipments
    const uniqueChannels = useMemo(() => Array.from(new Set(allSalesOrders.map((so: GroupedSalesOrder) => so.channel))).sort(), [allSalesOrders]);

    // 2. Filter exactly like "Export CSV" feature
    const trackingOrders = useMemo(() => {
        const filtered = allSalesOrders.filter((so: GroupedSalesOrder) => {
            const channelLower = so.channel.toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));

            if (!isAllowedChannel) return false;

            const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (
                trackingStatusLower === 'delivered' || 
                trackingStatusLower === 'successfully delivered' || 
                !!so.deliveredDate || 
                so.status === 'Delivered' ||
                (so.originalEeStatus || '').toLowerCase() === 'delivered' ||
                (so.originalEeStatus || '').toLowerCase() === 'closed'
            );

            // If it's Actually Delivered, we still show it (previously hidden per user request, now restored)

            let isTargetStatus = false;
            // Identify actual shipments (including Returned/RTO/Delivered)
            if (so.status === 'Shipped' || so.status === 'RTO Initiated' || so.status === 'Returned' || so.status === 'Delivered') {
                isTargetStatus = true;
            }

            if (!isTargetStatus) return false;

            // Apply search filters
            const safePoNumber = so.poReference || '';
            const safeChannel = so.channel || '';
            const safeAwb = so.awb || '';

            const matchesSearch = searchTerm === '' ||
                safePoNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                safeChannel.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesAwb = awbSearch === '' ||
                safeAwb.toLowerCase().includes(awbSearch.toLowerCase());

            const matchesChannel = channelFilter === '' || so.channel === channelFilter;

            if (!matchesSearch || !matchesAwb || !matchesChannel) return false;

            // Apply Tab filter
            if (activeTab === 'RTO') {
                return so.status === 'RTO Initiated' || so.status === 'Returned';
            } else if (activeTab === 'Delivered') {
                return isActuallyDelivered;
            } else if (activeTab === 'GRN_PO_Upload') {
                return isActuallyDelivered;
            } else if (activeTab === 'Today') {
                return isSameDay(so.appointmentDate, todayDate) && !isActuallyDelivered && so.status !== 'RTO Initiated' && so.status !== 'Returned';
            } else if (activeTab === 'Tomorrow') {
                return isSameDay(so.appointmentDate, tomorrowDate) && !isActuallyDelivered && so.status !== 'RTO Initiated' && so.status !== 'Returned';
            } else if (activeTab === 'Missed') {
                const missedAppt = isPastDate(so.appointmentDate, todayDate);
                const missedEdd = !so.appointmentDate && isPastDate(so.edd, todayDate);
                const isRTO = so.status === 'RTO Initiated' || so.status === 'Returned' || so.status === 'RTO' || so.originalEeStatus.toLowerCase() === 'returned' || so.originalEeStatus.toLowerCase() === 'rto';
                return (missedAppt || missedEdd) && !isActuallyDelivered && !isRTO;
            }

            return true;
        });

        const parseAppointmentDateTime = (date?: string, time?: string) => {
            if (!date) return 0;
            try {
                let d = new Date(date);
                if (d.getFullYear() < 2000) {
                    // Excel epoch bug usually maps to 1899. Return 0 to put it at the end.
                    return 0;
                }
                if (isNaN(d.getTime())) {
                    const parts = date.split('-');
                    if (parts.length === 3) {
                        if (parts[2].length === 4) {
                            d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                        } else {
                            d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        }
                    }
                }

                if (time && !isNaN(d.getTime())) {
                    const timeStr = String(time).trim();
                    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{1,2})\s*(AM|PM)/i);
                    if (ampmMatch) {
                        let hours = parseInt(ampmMatch[1], 10);
                        const minutes = parseInt(ampmMatch[2], 10);
                        const ampm = ampmMatch[3].toUpperCase();
                        if (ampm === 'PM' && hours < 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        d.setHours(hours, minutes, 0, 0);
                    } else if (timeStr.includes('T')) {
                        const t = new Date(timeStr);
                        d.setHours(t.getHours(), t.getMinutes(), t.getSeconds());
                    } else {
                        const parts = timeStr.match(/(\d{1,2}):(\d{1,2})/);
                        if (parts) {
                            d.setHours(parseInt(parts[1]), parseInt(parts[2]), 0, 0);
                        }
                    }
                }
                return d.getTime();
            } catch (e) {
                return 0;
            }
        };

        // ASCEND order of appointment date
        filtered.sort((a: GroupedSalesOrder, b: GroupedSalesOrder) => {
            const timeA = parseAppointmentDateTime(a.appointmentDate, a.appointmentTime);
            const timeB = parseAppointmentDateTime(b.appointmentDate, b.appointmentTime);

            if (timeA > 0 && timeB > 0) return timeA - timeB; // Ascending
            if (timeA > 0) return -1;
            if (timeB > 0) return 1;

            const fallbackA = new Date(a.edd || a.orderDate || 0).getTime();
            const fallbackB = new Date(b.edd || b.orderDate || 0).getTime();
            return fallbackB - fallbackA; // Descending for others
        });

        return filtered;
    }, [allSalesOrders, searchTerm, awbSearch, channelFilter, activeTab, todayDate, tomorrowDate]);

    const getStatusBadge = (so: GroupedSalesOrder) => {
        const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
        const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered' || so.originalEeStatus.toLowerCase() === 'delivered' || so.originalEeStatus.toLowerCase() === 'closed');
        const isRTO = so.status === 'RTO Initiated' || so.status === 'Returned' || so.status === 'RTO' || so.originalEeStatus.toLowerCase() === 'returned' || so.originalEeStatus.toLowerCase() === 'rto';
        const isMissed = isPastDate(so.appointmentDate || so.edd, todayDate) && !isActuallyDelivered && !isRTO;

        if (isActuallyDelivered) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircleIcon className="w-3 h-3" /> Delivered</span>;
        if (isRTO) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> RTO / Returned</span>;
        if (isMissed) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> Missed</span>;
        if (so.appointmentDate) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 flex items-center gap-1 w-fit"><CalendarIcon className="w-3 h-3" /> Appt Confirmed</span>;
        if (so.awb) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex items-center gap-1 w-fit"><TruckIcon className="w-3 h-3" /> In Transit</span>;

        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 w-fit">{so.status || 'Pending'}</span>;
    };

    // WhatsApp share handler
    const handleWhatsAppShare = useCallback(() => {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        // We need to categorize from the full unfiltered list (before tab filter)
        const baseOrders = allSalesOrders.filter((so: GroupedSalesOrder) => {
            const channelLower = so.channel.toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));
            if (!isAllowedChannel) return false;
            const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');
            if (isActuallyDelivered) return false;
            if (so.status === 'RTO Initiated' || so.status === 'Returned') return false;
            return so.status === 'Shipped';
        });

        const missedOrders = baseOrders.filter((so: GroupedSalesOrder) => isPastDate(so.appointmentDate || so.edd, today));
        const todayOrders = baseOrders.filter((so: GroupedSalesOrder) => isSameDay(so.appointmentDate, today));
        const tomorrowOrders = baseOrders.filter((so: GroupedSalesOrder) => isSameDay(so.appointmentDate, tomorrow));

        const formatLine = (so: GroupedSalesOrder) => {
            const awb = so.awb || 'N/A';
            const apptDate = formatSafeDate(so.appointmentDate) || formatSafeDate(so.edd) || 'N/A';
            const apptTime = formatSafeTime(so.appointmentTime) || '';
            return `${awb} | ${apptDate}${apptTime ? ' ' + apptTime : ''}`;
        };

        let message = `📋 *Appointment Schedule Summary*\n📅 Date: ${todayStr}\n\n`;

        message += `🔴 *Missed Appointments (${missedOrders.length})*\n`;
        if (missedOrders.length > 0) {
            missedOrders.forEach((so: GroupedSalesOrder) => { message += formatLine(so) + '\n'; });
        } else {
            message += '_None_\n';
        }

        message += `\n🟠 *Today's Appointments (${todayOrders.length})*\n`;
        if (todayOrders.length > 0) {
            todayOrders.forEach((so: GroupedSalesOrder) => { message += formatLine(so) + '\n'; });
        } else {
            message += '_None_\n';
        }

        message += `\n🔵 *Tomorrow's Appointments (${tomorrowOrders.length})*\n`;
        if (tomorrowOrders.length > 0) {
            tomorrowOrders.forEach((so: GroupedSalesOrder) => { message += formatLine(so) + '\n'; });
        } else {
            message += '_None_\n';
        }

        // Build WhatsApp Web URL — pre-fill the logged-in user's contact number if available
        const phone = currentUser?.contactNumber ? currentUser.contactNumber.replace(/[^0-9]/g, '') : '';
        const encodedMessage = encodeURIComponent(message);
        const waUrl = phone
            ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`
            : `https://web.whatsapp.com/send?text=${encodedMessage}`;
        window.open(waUrl, '_blank');
    }, [allSalesOrders, currentUser]);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
            {/* Header & Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                {/* Priority Tabs */}
                <div className="flex space-x-4 mb-4 border-b border-gray-200 pb-2 overflow-x-auto">
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 whitespace-nowrap ${activeTab === 'All' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('All')}
                    >
                        All Shipments
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Today' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Today')}
                    >
                        Today's Appts
                        <span className="bg-orange-100 text-orange-600 py-0.5 px-2 rounded-full text-xs">Priority</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Tomorrow' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Tomorrow')}
                    >
                        Tomorrow's Appts
                        <span className="bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs">Upcoming</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Missed' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Missed')}
                    >
                        Missed Deliveries
                        <span className="bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">Action Required</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Delivered' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Delivered')}
                    >
                        Delivered
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'GRN_PO_Upload' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('GRN_PO_Upload')}
                    >
                        GRN / PO Upload
                        <span className="bg-teal-100 text-teal-600 py-0.5 px-2 rounded-full text-xs font-bold">Auto-Sync</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'RTO' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('RTO')}
                    >
                        RTO / Returned
                        <span className="bg-purple-100 text-purple-600 py-0.5 px-2 rounded-full text-xs">Alert</span>
                    </button>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by PO Number or Store..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="relative flex-1 min-w-[150px] max-w-[200px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FilterIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <select
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                            value={channelFilter}
                            onChange={(e) => setChannelFilter(e.target.value)}
                        >
                            <option value="">All Channels</option>
                            {uniqueChannels.map((c: string) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Filter by AWB Number..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-blue-50/30"
                            value={awbSearch}
                            onChange={(e) => setAwbSearch(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleWhatsAppShare}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap"
                        title="Share appointment summary on WhatsApp"
                    >
                        <ChatIcon className="h-4 w-4" />
                        Share on WhatsApp
                    </button>
                </div>
            </div>

            {/* Tracking Table */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'GRN_PO_Upload' ? (
                    <div className="flex flex-col gap-4">
                        {/* Bot Session Health Panel */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-ping"></div>
                                    <h3 className="font-bold text-gray-900 text-sm">Portal Bot Session Health</h3>
                                </div>
                                <button
                                    onClick={checkAllSessions}
                                    disabled={isCheckingSessions || refreshingPortal !== null}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-all"
                                >
                                    <RefreshIcon className={`w-3.5 h-3.5 ${isCheckingSessions ? 'animate-spin' : ''}`} />
                                    Check All Sessions
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {['blinkit', 'instamart', 'zepto', 'flipkart'].map((portalId) => {
                                    const statusObj = sessionStatuses.find((s) => s.portalId === portalId);
                                    const name = portalId === 'blinkit' ? 'Blinkit PartnersBiz' :
                                                 portalId === 'instamart' ? 'Instamart Partner' :
                                                 portalId === 'zepto' ? 'Zepto Brands' : 'Flipkart Vendor Hub';
                                                 
                                    const isPortalRefreshing = refreshingPortal === portalId;
                                    const isBotRunning = !!runningBots[portalId];

                                    let badgeColor = 'bg-gray-100 text-gray-700';
                                    let badgeText = 'Unknown';
                                    
                                    if (statusObj) {
                                        if (statusObj.status === 'active') {
                                            badgeColor = 'bg-green-100 text-green-700 border border-green-200';
                                            badgeText = 'Session Active';
                                        } else if (statusObj.status === 'expired') {
                                            badgeColor = 'bg-yellow-100 text-yellow-700 border border-yellow-200';
                                            badgeText = 'Session Expired';
                                        } else if (statusObj.status === 'error') {
                                            badgeColor = 'bg-red-100 text-red-700 border border-red-200';
                                            badgeText = 'Check Failed';
                                        }
                                    }

                                    return (
                                        <div key={portalId} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 hover:shadow-md hover:border-gray-200 transition-all flex flex-col justify-between min-h-[160px]">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <h4 className="font-bold text-gray-800 text-xs truncate max-w-[130px]" title={name}>{name}</h4>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeColor}`}>
                                                        {badgeText}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-gray-500 line-clamp-2 min-h-[30px]" title={statusObj?.detail}>
                                                    {statusObj ? statusObj.detail : 'No status checked yet.'}
                                                </p>
                                                {statusObj?.stateModifiedAt && (
                                                    <div className="text-[9px] text-gray-400 mt-1">
                                                        Age: <span className="font-medium">{statusObj.stateAgeHours ? `${statusObj.stateAgeHours}h` : '-'}</span> | Mod: <span className="font-medium">{new Date(statusObj.stateModifiedAt).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-3">
                                                {isPortalRefreshing ? (
                                                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 mb-2 text-[9px] text-indigo-700 font-medium">
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <RefreshIcon className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                                            <span>Refreshing Session...</span>
                                                        </div>
                                                        <p className="truncate" title={refreshMessage}>{refreshMessage}</p>
                                                    </div>
                                                ) : null}

                                                <div className="flex gap-2 w-full">
                                                    <button
                                                        onClick={() => triggerSessionRefresh(portalId)}
                                                        disabled={refreshingPortal !== null || isCheckingSessions || (isCloudEnv && isLocalServerConnected !== true)}
                                                        className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-[10px] font-bold rounded-lg shadow-sm transition-all"
                                                        title={
                                                            isCloudEnv && isLocalServerConnected !== true
                                                                ? "Use Chrome Extension to sync cookies on cloud"
                                                                : (isCloudEnv && isLocalServerConnected === false ? "Local desktop server disconnected" : "Refresh login token manually")
                                                        }
                                                    >
                                                        Login Capture
                                                    </button>
                                                    <button
                                                        onClick={() => triggerPortalBotRun(portalId)}
                                                        disabled={refreshingPortal !== null || isBotRunning || isCheckingSessions || (isCloudEnv && isLocalServerConnected === false)}
                                                        className="flex-1 px-2.5 py-1.5 bg-teal-600 border border-teal-700 text-white hover:bg-teal-700 disabled:opacity-50 text-[10px] font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1"
                                                        title={isCloudEnv && isLocalServerConnected === false ? "Local desktop server disconnected" : "Launch bot script to download PO/GRN"}
                                                    >
                                                        {isBotRunning ? (
                                                            <RefreshIcon className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <TruckIcon className="w-3 h-3" />
                                                        )}
                                                        Run Bot
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Scanning & batch controls */}
                        {isCloudEnv && isLocalServerConnected !== true ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm flex items-start gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg mt-0.5">
                                    <AlertIcon className="w-5 h-5 text-amber-600" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-amber-900 text-sm">Local Server Disconnected</h3>
                                    <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
                                        You are viewing the dashboard on the cloud Vercel link. To use **local file scanning, automatic GRN matching, or browser automation**, please ensure your local Express server is running on your desktop by executing <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px] text-amber-900">npm run dev</code>.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center justify-between gap-4 bg-teal-50 border border-teal-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
                                {isCloudEnv && isLocalServerConnected === true && (
                                    <div className="absolute top-2 right-4 flex items-center gap-1.5 bg-green-100 border border-green-200 py-0.5 px-2 rounded-full">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                        <span className="text-[9px] text-green-700 font-bold uppercase tracking-wider">Desktop Server Connected</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-100">
                                        <RefreshIcon className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-teal-900 text-sm">Playwright Bot Directory Scan</h3>
                                        <p className="text-xs text-teal-700">
                                            {isScanning ? 'Scanning local downloads folder...' : `Scanned local directory: found ${localFiles.length} files.`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={scanLocalFiles}
                                        disabled={isScanning || isBatchUploading}
                                        className="px-4 py-2 bg-white hover:bg-gray-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <RefreshIcon className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                                        Scan Files
                                    </button>
                                    <button
                                        onClick={handleBatchAutoUpload}
                                        disabled={isScanning || isBatchUploading || trackingOrders.length === 0}
                                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-100 flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isBatchUploading ? (
                                            <>
                                                <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                                                Uploading Match...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                                Scan &amp; Auto-Upload All
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Document Upload Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200 shrink-0">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">PO &amp; Channel Details</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[180px]">Delivery Info</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">PO File (Upload)</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">GRN File (Upload)</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[220px]">GRN Number &amp; Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {trackingOrders.length > 0 ? trackingOrders.map((so: GroupedSalesOrder) => {
                                        const { poMatch, grnMatch } = findLocalMatches(so.poReference);
                                        const isAutoUploading = autoUploadingId === so.id;

                                        return (
                                            <tr key={so.id} className="hover:bg-gray-50/50 transition-colors">
                                                {/* PO & Channel Details */}
                                                <td className="px-6 py-4">
                                                    <div className="font-semibold text-gray-900">{so.channel}</div>
                                                    <div className="text-xs text-gray-500">{so.storeCode || '-'}</div>
                                                    <div className="text-xs text-indigo-600 font-bold mt-1.5" title={so.poReference}>PO: {so.poReference}</div>
                                                </td>

                                                {/* Delivery Info */}
                                                <td className="px-6 py-4">
                                                    <div className="text-xs text-gray-900"><span className="font-semibold text-gray-600">AWB:</span> {so.awb || '-'}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5"><span className="font-semibold text-gray-600">Carrier:</span> {so.carrier || '-'}</div>
                                                    <div className="text-[11px] text-green-600 font-bold mt-1">Delivered: {formatSafeDate(so.deliveredDate) || '-'}</div>
                                                </td>

                                                {/* PO File Upload */}
                                                <td className="px-6 py-4">
                                                    {so.poPdfUrl ? (
                                                        <div className="flex flex-col gap-1.5">
                                                            <a href={so.poPdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-900 font-bold underline">
                                                                <ExternalLinkIcon className="w-3.5 h-3.5" />
                                                                View PO File
                                                            </a>
                                                            <label className="text-[10px] text-gray-500 cursor-pointer hover:text-indigo-600 font-semibold underline flex items-center gap-0.5">
                                                                <PaperclipIcon className="w-3 h-3" />
                                                                Re-upload PO
                                                                <input
                                                                    type="file"
                                                                    accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls"
                                                                    className="hidden"
                                                                    onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) handleManualDocumentUpload(file, so.poReference, so.id, 'PO');
                                                                    }}
                                                                    disabled={uploadingPoId === so.id}
                                                                />
                                                            </label>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2">
                                                            {poMatch && (!isCloudEnv || isLocalServerConnected === true) ? (
                                                                <button
                                                                    onClick={() => handleAutoUpload(so.poReference, so.id, 'PO', poMatch.path, poMatch.name)}
                                                                    disabled={uploadingPoId === so.id || isAutoUploading}
                                                                    className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-bold border border-teal-200 transition-colors w-fit shadow-sm animate-pulse"
                                                                    title={`Auto-detected: ${poMatch.name}`}
                                                                >
                                                                    {uploadingPoId === so.id ? (
                                                                        <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircleIcon className="w-3.5 h-3.5 text-teal-600" />
                                                                    )}
                                                                    Auto-Upload PO
                                                                </button>
                                                            ) : null}
                                                            <div>
                                                                {uploadingPoId === so.id && !poMatch ? (
                                                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                                                        <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                                                                        Uploading...
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col gap-1.5">
                                                                        <label className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold cursor-pointer w-fit border border-indigo-200 transition-colors">
                                                                            <PaperclipIcon className="w-3.5 h-3.5" />
                                                                            Upload PO File
                                                                            <input
                                                                                type="file"
                                                                                accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls"
                                                                                className="hidden"
                                                                                onChange={(e) => {
                                                                                    const file = e.target.files?.[0];
                                                                                    if (file) handleManualDocumentUpload(file, so.poReference, so.id, 'PO');
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        {['zepto', 'blinkit', 'instamart', 'flipkart'].some(c => so.channel.toLowerCase().includes(c)) && (!isCloudEnv || isLocalServerConnected === true) && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    const ch = so.channel.toLowerCase();
                                                                                    const portalId = ch.includes('zepto') ? 'zepto' :
                                                                                                     ch.includes('blinkit') ? 'blinkit' :
                                                                                                     ch.includes('instamart') ? 'instamart' :
                                                                                                     ch.includes('flipkart') ? 'flipkart' : null;
                                                                                    if (portalId) triggerPortalBotRun(portalId);
                                                                                }}
                                                                                disabled={refreshingPortal !== null}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg text-xs font-bold border border-gray-200 transition-all shadow-sm w-fit"
                                                                            >
                                                                                <TruckIcon className="w-3.5 h-3.5 text-gray-400" />
                                                                                Launch Bot
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* GRN File Upload */}
                                                <td className="px-6 py-4">
                                                    {so.podImageUrl ? (
                                                        <div className="flex flex-col gap-1.5">
                                                            <a href={so.podImageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-600 hover:text-green-900 font-bold underline animate-fade-in">
                                                                <ExternalLinkIcon className="w-3.5 h-3.5" />
                                                                View GRN File
                                                            </a>
                                                            <label className="text-[10px] text-gray-500 cursor-pointer hover:text-green-600 font-semibold underline flex items-center gap-0.5">
                                                                <PaperclipIcon className="w-3 h-3" />
                                                                Re-upload GRN
                                                                <input
                                                                    type="file"
                                                                    accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls"
                                                                    className="hidden"
                                                                    onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) handleManualDocumentUpload(file, so.poReference, so.id, 'GRN');
                                                                    }}
                                                                    disabled={uploadingGrnId === so.id}
                                                                />
                                                            </label>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2">
                                                            {grnMatch && (!isCloudEnv || isLocalServerConnected === true) ? (
                                                                <button
                                                                    onClick={() => handleAutoUpload(so.poReference, so.id, 'GRN', grnMatch.path, grnMatch.name)}
                                                                    disabled={uploadingGrnId === so.id || isAutoUploading}
                                                                    className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-bold border border-teal-200 transition-colors w-fit shadow-sm animate-pulse"
                                                                    title={`Auto-detected: ${grnMatch.name}`}
                                                                >
                                                                    {uploadingGrnId === so.id ? (
                                                                        <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircleIcon className="w-3.5 h-3.5 text-teal-600" />
                                                                    )}
                                                                    Auto-Upload GRN
                                                                </button>
                                                            ) : null}
                                                            <div>
                                                                {uploadingGrnId === so.id && !grnMatch ? (
                                                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                                                        <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                                                                        Uploading...
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col gap-1.5">
                                                                        <label className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-bold cursor-pointer w-fit border border-green-200 transition-colors">
                                                                            <PaperclipIcon className="w-3.5 h-3.5" />
                                                                            Upload GRN File
                                                                            <input
                                                                                type="file"
                                                                                accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls"
                                                                                className="hidden"
                                                                                onChange={(e) => {
                                                                                    const file = e.target.files?.[0];
                                                                                    if (file) handleManualDocumentUpload(file, so.poReference, so.id, 'GRN');
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        {['zepto', 'blinkit', 'instamart', 'flipkart'].some(c => so.channel.toLowerCase().includes(c)) && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    const ch = so.channel.toLowerCase();
                                                                                    const portalId = ch.includes('zepto') ? 'zepto' :
                                                                                                     ch.includes('blinkit') ? 'blinkit' :
                                                                                                     ch.includes('instamart') ? 'instamart' :
                                                                                                     ch.includes('flipkart') ? 'flipkart' : null;
                                                                                    if (portalId) triggerPortalBotRun(portalId);
                                                                                }}
                                                                                disabled={refreshingPortal !== null}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg text-xs font-bold border border-gray-200 transition-all shadow-sm w-fit"
                                                                            >
                                                                                <TruckIcon className="w-3.5 h-3.5 text-gray-400" />
                                                                                Launch Bot
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* GRN Number & Action */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="GRN Number"
                                                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs w-36 focus:ring-teal-500 focus:border-teal-500 outline-none"
                                                            value={grnNumberInputs[so.id] !== undefined ? grnNumberInputs[so.id] : (so.grnNumber || '')}
                                                            onChange={(e) => setGrnNumberInputs(prev => ({ ...prev, [so.id]: e.target.value }))}
                                                        />
                                                        {(grnNumberInputs[so.id] !== undefined && grnNumberInputs[so.id] !== (so.grnNumber || '')) && (
                                                            <button
                                                                onClick={() => handleSaveGrnNumber(so.poReference, so.id)}
                                                                disabled={savingGrnNumberId === so.id}
                                                                className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-colors"
                                                            >
                                                                {savingGrnNumberId === so.id ? (
                                                                    <RefreshIcon className="w-3 h-3 animate-spin" />
                                                                ) : 'Save'}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {so.grnNumber && (
                                                        <div className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1">
                                                            <CheckCircleIcon className="w-3 h-3 text-green-500 flex-shrink-0" />
                                                            <span className="font-medium truncate max-w-[120px]">GRN: {so.grnNumber}</span>
                                                            {so.grnDate && <span className="italic flex-shrink-0">({so.grnDate})</span>}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                                <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                                <p className="text-lg font-medium">No delivered shipments found</p>
                                                <p className="text-sm mt-1">Make sure you have shipments marked as Delivered.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 shrink-0">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[140px]">Channel &amp; Store</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">PO Details</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Quantities</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[220px]">Tracking Details</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[180px]">Status &amp; EDD</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">Appointment</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {trackingOrders.length > 0 ? trackingOrders.map((so: GroupedSalesOrder) => {
                                    const isToday = isSameDay(so.appointmentDate, todayDate);
                                    const isTomorrow = isSameDay(so.appointmentDate, tomorrowDate);
                                    // const isMissed = isPastDate(so.appointmentDate || so.edd, todayDate); // Redundant declaration removed
 
                                    const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
                                    const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');
 
                                    const isRTO = so.status === 'RTO Initiated' || so.status === 'Returned' || so.status === 'RTO' || so.originalEeStatus.toLowerCase() === 'returned' || so.originalEeStatus.toLowerCase() === 'rto';
                                    const isMissed = isPastDate(so.appointmentDate || so.edd, todayDate) && !isActuallyDelivered && !isRTO;
 
                                    let rowClass = "hover:bg-gray-50 transition-colors border-l-4 border-transparent cursor-pointer";
                                    if (isToday && !isActuallyDelivered) {
                                        rowClass = "bg-orange-50/60 hover:bg-orange-100 transition-colors border-l-4 border-orange-500 cursor-pointer";
                                    } else if (isTomorrow && !isActuallyDelivered) {
                                        rowClass = "bg-blue-50/60 hover:bg-blue-100 transition-colors border-l-4 border-blue-500 cursor-pointer";
                                    } else if (isMissed && !isActuallyDelivered) {
                                        rowClass = "bg-red-50 hover:bg-red-100/80 transition-colors border-l-4 border-red-500 cursor-pointer";
                                    } else if (isActuallyDelivered) {
                                        rowClass = "bg-green-50/30 hover:bg-green-50 transition-colors border-l-4 border-green-400 opacity-80 cursor-pointer";
                                    }
 
                                    const isExpanded = expandedRowId === so.id;
                                    const channelLower = (so.channel || '').toLowerCase();
 
                                    return (
                                        <React.Fragment key={so.id}>
                                        <tr 
                                            onClick={() => setExpandedRowId(isExpanded ? null : so.id)}
                                            className={rowClass}
                                        >
                                            {/* Channel & Store */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
                                                    <div>
                                                        <div className="font-semibold text-gray-900">{so.channel}</div>
                                                        <div className="text-sm text-gray-500">{so.storeCode || '-'}</div>
                                                    </div>
                                                </div>
                                            </td>
 
                                            {/* PO Details */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">{so.poReference}</span>
                                                    {so.orderNotes && <MessageIcon className="h-4 w-4 text-orange-500 flex-shrink-0" title="Has Order Notes" />}
                                                </div>
                                                <div className="text-xs text-gray-500">PO Date: {so.orderDate || '-'}</div>
                                                {so.poExpiryDate && <div className="text-xs text-red-500 mt-0.5">Exp: {so.poExpiryDate}</div>}
                                            </td>
 
                                            {/* Quantities */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">Boxes: <span className="font-medium">{so.boxCount || '-'}</span></div>
                                                <div className="text-sm text-gray-500">Shipped Qty: <span className="font-medium">{so.qty || '-'}</span></div>
                                            </td>
 
                                            {/* Tracking Details */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col gap-0.5">
                                                    {so.awb ? (
                                                        <>
                                                            <div className="text-sm text-gray-900 flex items-center gap-1.5">
                                                                <span className="font-semibold">AWB:</span>
                                                                {so.trackingUrl ? (
                                                                    <a href={so.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-900 font-medium underline">
                                                                        {so.awb}
                                                                    </a>
                                                                ) : (
                                                                    <span>{so.awb}</span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500"><span className="font-medium">Carrier:</span> {so.carrier || '-'}</div>
                                                            {so.currentLocation && <div className="text-xs text-gray-500 truncate mt-1" title={so.currentLocation}>📍 {so.currentLocation}</div>}
                                                        </>
                                                    ) : (
                                                        <span className="text-sm text-gray-400 italic">No AWB Extracted</span>
                                                    )}
                                                </div>
                                            </td>
 
                                            {/* Status & EDD */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="mb-1.5 flex flex-col gap-1">
                                                    {getStatusBadge(so)}
                                                    {so.trackingStatus && <span className="text-xs font-semibold text-gray-700 w-40 truncate mt-0.5" title={so.trackingStatus}>Status: {so.trackingStatus}</span>}
                                                    {so.latestStatus && <span className="text-xs text-gray-500 w-40 truncate" title={so.latestStatus}>{so.latestStatus}</span>}
                                                </div>
                                                <div className="text-xs text-gray-700 mt-1 pb-1">
                                                    <span className="font-bold border-t border-gray-200 pt-2 mt-1 block w-full">Order Date: <span className="font-medium text-gray-600">{so.orderDate || '-'}</span></span>
                                                </div>
                                            </td>
 
                                            {/* Appointment */}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {isToday && !isActuallyDelivered && <div className="text-xs text-orange-600 font-bold mb-1 uppercase tracking-wider animate-pulse">Today</div>}
                                                {isTomorrow && !isActuallyDelivered && <div className="text-xs text-blue-600 font-bold mb-1 uppercase tracking-wider">Tomorrow</div>}
                                                {isMissed && !isActuallyDelivered && <div className="text-xs text-red-600 font-bold mb-1 uppercase tracking-wider">Missed</div>}
                                                <div className="font-medium text-gray-900 mt-0.5">
                                                    {so.appointmentDate ? (
                                                        <div className="flex flex-col">
                                                            <span>{formatSafeDate(so.appointmentDate) || so.appointmentDate}</span>
                                                            <span className="text-xs text-gray-600 font-normal">{formatSafeTime(so.appointmentTime)}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 italic font-normal">Pending Appt</span>
                                                    )}
                                                </div>
                                                {so.appointmentId && (
                                                    <div className="flex flex-col gap-1 mt-1.5">
                                                        <div className="text-xs text-indigo-600 bg-indigo-50 py-0.5 px-1.5 rounded inline-block font-medium w-fit border border-indigo-100">
                                                            ID: {so.appointmentId}
                                                        </div>
                                                        {(channelLower.includes('zepto') || channelLower.includes('instamart') || channelLower.includes('bb') || channelLower.includes('blinkit')) && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setApptUpdateModal({ isOpen: true, so }); }}
                                                                className="mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded text-[10px] font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1 w-fit"
                                                            >
                                                                Update Details
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {!so.appointmentId && (channelLower.includes('zepto') || channelLower.includes('instamart') || channelLower.includes('bb') || channelLower.includes('blinkit')) && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setApptUpdateModal({ isOpen: true, so }); }}
                                                        className="mt-2 px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100 hover:bg-indigo-100 transition-all active:scale-95 flex items-center gap-1"
                                                    >
                                                        <PlusIcon className="h-3 w-3" /> Update Appt
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={6} className="px-6 py-4">
                                                    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                                                        <OrderNotesTimeline 
                                                            poNumber={so.poReference}
                                                            notesString={so.orderNotes}
                                                            currentUser={currentUser || null}
                                                            onNoteAdded={() => {}}
                                                            onLocalNoteUpdate={(newNotes: string) => {
                                                                if (setPurchaseOrders) {
                                                                    setPurchaseOrders(prev => prev.map(p => {
                                                                        if (so.poReference.includes(String(p.id))) {
                                                                            return { ...p, orderNotes: newNotes };
                                                                        }
                                                                        return p;
                                                                    }));
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    )
                                }) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                            <p className="text-lg font-medium">No shipments matching criteria</p>
                                            <p className="text-sm mt-1">Adjust filters or select another tab.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {apptUpdateModal.isOpen && apptUpdateModal.so && (
                <AppointmentUpdateModal
                    so={apptUpdateModal.so}
                    onClose={() => setApptUpdateModal({ isOpen: false, so: null })}
                    addNotification={addNotification || (() => {})}
                    onComplete={() => {
                        // Re-fetch should happen if props allow, but for now we expect setPurchaseOrders to be triggered if implemented
                        if (setPurchaseOrders) {
                            // Minimal implementation: if specific refresh logic is needed, it would be here
                        }
                    }}
                    currentUser={currentUser}
                />
            )}
        </div>
    );
};

export default ShipmentManager;
