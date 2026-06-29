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
}

type NetworkLogListener = (logs: NetworkLog[]) => void;

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

            this.logs = [newLog, ...this.logs];
            this.notify();

            const startTime = performance.now();
            try {
                const response = await originalFetch(input, init);
                const duration = Math.round(performance.now() - startTime);

                // Clone response to read body without consuming the stream
                const responseClone = response.clone();
                let responseBody: any = null;
                try {
                    const contentType = responseClone.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        responseBody = await responseClone.json();
                    } else {
                        responseBody = await responseClone.text();
                        // Truncate if response text is excessively long
                        if (typeof responseBody === 'string' && responseBody.length > 5000) {
                            responseBody = responseBody.slice(0, 5000) + '... [Truncated due to size]';
                        }
                    }
                } catch (e) {
                    responseBody = '[Could not parse response body]';
                }

                // If response status is not OK (like 400, 500), mark as failed
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
        this.logs = this.logs.map(log => 
            log.id === id ? { ...log, ...updates } : log
        );
        this.notify();
    }

    private notify() {
        this.listeners.forEach(listener => listener(this.logs));
    }
}

export const networkInterceptor = new NetworkInterceptor();
