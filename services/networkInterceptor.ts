export interface NetworkLog {
    id: string;
    method: string;
    url: string;
    timestamp: Date;
    status: 'pending' | 'success' | 'failed';
    statusCode?: number;
    requestBody?: any;
    responseBody?: any;
    errorMessage?: string;
    duration?: number;
    displayName?: string;
    displayDescription?: string;
    dataSummary?: string;
}

type NetworkLogListener = (logs: NetworkLog[]) => void;

function parseLogHumanMetadata(log: NetworkLog) {
    let displayName = 'Unknown Process';
    let displayDescription = 'System triggered an unrecognized network request.';
    let dataSummary = 'Awaiting response...';

    const urlStr = log.url;
    let actionVal = '';
    
    // Extract action from URL query params
    try {
        const urlObj = new URL(urlStr, window.location.origin);
        actionVal = urlObj.searchParams.get('action') || '';
    } catch(e) {}

    // Extract action from request body if available
    if (!actionVal && log.requestBody && typeof log.requestBody === 'object') {
        actionVal = log.requestBody.action || '';
    }

    // Determine displayName and displayDescription
    if (urlStr.includes('/api/login-google')) {
        displayName = 'Google Authentication';
        displayDescription = 'Logging into your Cubelelo profile using Google credentials.';
    } else if (urlStr.includes('/api/auth/google/url')) {
        displayName = 'Request Login Link';
        displayDescription = 'Requesting the Google OAuth verification link from the backend.';
    } else if (urlStr.includes('/api/update-google-sheet')) {
        displayName = 'Export Sales Orders';
        displayDescription = 'Saving updated Sales Orders status back to the Google Sheets tracker.';
    } else if (actionVal) {
        switch(actionVal) {
            case 'getPurchaseOrders':
                displayName = 'Sync Purchase Orders';
                displayDescription = 'Downloading latest active purchase orders from the portal.';
                break;
            case 'getInventory':
                displayName = 'Sync Inventory Stock';
                displayDescription = 'Updating local warehouse stock levels from EasyEcom.';
                break;
            case 'getChannelConfigs':
                displayName = 'Fetch Store Configurations';
                displayDescription = 'Loading configuration settings for active storefront channels.';
                break;
            case 'getUsers':
                displayName = 'Fetch Admins & Logs';
                displayDescription = 'Retrieving portal users, role privileges, and audit log histories.';
                break;
            case 'getQuotations':
                displayName = 'Fetch Quotations';
                displayDescription = 'Retrieving active quotations and price checks from database.';
                break;
            case 'getUploadMetadata':
                displayName = 'Fetch Upload History';
                displayDescription = 'Retrieving logs of uploaded purchase order sheets.';
                break;
            case 'getPackingData':
                displayName = 'Fetch Packing Details';
                displayDescription = 'Loading dimensions, box counts, and packaging metadata.';
                break;
            case 'logFileUpload':
                displayName = 'File Upload Log';
                displayDescription = 'Registering a newly uploaded file attachment in the master database.';
                break;
            case 'processFlipkartConsignment':
                displayName = 'Process Flipkart Consignment';
                displayDescription = 'Importing Flipkart PO sheet and verifying fulfillable items.';
                break;
            case 'createZohoInvoice':
                displayName = 'Create Zoho Invoice';
                displayDescription = 'Creating draft invoice in Zoho Books finance accounts.';
                break;
            case 'processFlipkartEInvoice':
                displayName = 'Upload Flipkart E-Invoice';
                displayDescription = 'Pushing verified IRN, invoice numbers, and lines to Google Apps Script.';
                break;
            case 'pushToShippingPartner':
                displayName = 'Push to Shipping Partner';
                displayDescription = 'Registering shipment with courier partner and fetching AWB tracking.';
                break;
            case 'updateFBAShipmentId':
                displayName = 'Update Amazon FBA ID';
                displayDescription = 'Updating FBA Shipment reference codes on selected purchase orders.';
                break;
            case 'updatePOPickupDate':
                displayName = 'Update Pickup Schedule';
                displayDescription = 'Scheduling or updating warehouse pickup timing for dispatcher.';
                break;
            default:
                displayName = `Action: ${actionVal}`;
                displayDescription = `Triggered custom action [${actionVal}] on the backend server.`;
        }
    } else if (urlStr.includes('jsonplaceholder.typicode.com')) {
        displayName = 'Fetch Demo Post';
        displayDescription = 'Simulating an HTTP GET call to test network visual logs.';
    } else if (urlStr.includes('httpstat.us/500')) {
        displayName = 'Simulate Error 500';
        displayDescription = 'Triggering a mock POST request designed to fail with a Server Error 500.';
    } else if (urlStr.includes('invalid.domain.cubelelo.com')) {
        displayName = 'Simulate Connection Failure';
        displayDescription = 'Triggering a mock fetch to a non-existent URL to test offline exceptions.';
    }

    // 2. Parse response and generate dataSummary
    if (log.status === 'pending') {
        dataSummary = 'Request is currently sending, waiting for server response...';
    } else if (log.status === 'failed') {
        if (log.errorMessage) {
            if (log.errorMessage.includes('Failed to fetch') || log.errorMessage.includes('Network Error')) {
                dataSummary = 'Connection failed. The server is offline or your internet connection was interrupted.';
            } else {
                dataSummary = `Failed: ${log.errorMessage}`;
            }
        } else {
            dataSummary = 'Failed with server response code ' + (log.statusCode || 'unknown') + '.';
        }
    } else if (log.status === 'success') {
        const body = log.responseBody;
        if (!body) {
            dataSummary = 'Process completed successfully (empty response returned).';
        } else if (typeof body === 'object') {
            if (Array.isArray(body)) {
                dataSummary = `Successfully loaded list containing ${body.length} records.`;
            } else {
                const status = body.status || 'success';
                const count = Array.isArray(body.data) ? body.data.length : null;
                const msg = body.message || body.details || body.msg || '';

                if (count !== null) {
                    dataSummary = `Successfully synced ${count} data records.`;
                } else if (msg) {
                    dataSummary = msg;
                } else if (body.title) {
                    dataSummary = `Fetched item details (Title: "${body.title}").`;
                } else {
                    dataSummary = 'Completed successfully. Server returned structured response data.';
                }
            }
        } else {
            if (typeof body === 'string') {
                if (body.toLowerCase().includes('success') || body.toLowerCase().includes('ok')) {
                    dataSummary = body.slice(0, 100);
                } else {
                    dataSummary = 'Completed. Received text response: ' + body.slice(0, 60) + (body.length > 60 ? '...' : '');
                }
            } else {
                dataSummary = 'Process completed successfully.';
            }
        }
    }

    log.displayName = displayName;
    log.displayDescription = displayDescription;
    log.dataSummary = dataSummary;
}

class NetworkInterceptor {
    private logs: NetworkLog[] = [];
    private listeners: Set<NetworkLogListener> = new Set();
    private initialized = false;

    public init() {
        if (this.initialized) return;
        this.initialized = true;

        const originalFetch = window.fetch;
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const id = Math.random().toString(36).substring(2, 9);
            const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
            const method = init?.method || 'GET';
            
            let requestBody: any = null;
            if (init?.body) {
                try {
                    if (typeof init.body === 'string') {
                        requestBody = JSON.parse(init.body);
                    } else if (init.body instanceof FormData) {
                        const keys: string[] = [];
                        init.body.forEach((_, key) => {
                            keys.push(key);
                        });
                        requestBody = `[FormData keys: ${keys.join(', ')}]`;
                    } else {
                        requestBody = '[Non-string body]';
                    }
                } catch (e) {
                    requestBody = init.body;
                }
            }

            const newLog: NetworkLog = {
                id,
                method,
                url,
                timestamp: new Date(),
                status: 'pending',
                requestBody
            };

            parseLogHumanMetadata(newLog);

            this.logs = [newLog, ...this.logs];
            this.notify();

            const startTime = performance.now();
            try {
                const response = await originalFetch(input, init);
                const duration = Math.round(performance.now() - startTime);

                const responseClone = response.clone();
                let responseBody: any = null;
                try {
                    const contentType = responseClone.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        responseBody = await responseClone.json();
                    } else {
                        responseBody = await responseClone.text();
                        if (typeof responseBody === 'string' && responseBody.length > 5000) {
                            responseBody = responseBody.slice(0, 5000) + '... [Truncated due to size]';
                        }
                    }
                } catch (e) {
                    responseBody = '[Could not parse response body]';
                }

                const isSuccess = response.ok;
                
                this.updateLog(id, {
                    status: isSuccess ? 'success' : 'failed',
                    statusCode: response.status,
                    responseBody,
                    duration,
                    errorMessage: isSuccess ? undefined : `HTTP Error ${response.status}: ${response.statusText || 'Failed Request'}`
                });

                return response;
            } catch (error: any) {
                const duration = Math.round(performance.now() - startTime);
                this.updateLog(id, {
                    status: 'failed',
                    duration,
                    errorMessage: error.message || String(error)
                });
                throw error;
            }
        };
    }

    public getLogs() {
        return this.logs;
    }

    public clearLogs() {
        this.logs = [];
        this.notify();
    }

    public subscribe(listener: NetworkLogListener) {
        this.listeners.add(listener);
        listener(this.logs);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private updateLog(id: string, updates: Partial<NetworkLog>) {
        this.logs = this.logs.map(log => {
            if (log.id === id) {
                const updatedLog = { ...log, ...updates };
                parseLogHumanMetadata(updatedLog);
                return updatedLog;
            }
            return log;
        });
        this.notify();
    }

    private notify() {
        this.listeners.forEach(listener => listener(this.logs));
    }
}

export const networkInterceptor = new NetworkInterceptor();
