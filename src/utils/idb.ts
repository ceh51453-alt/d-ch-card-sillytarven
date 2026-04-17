export const IDB = {
    dbName: 'st-translator-db',
    storeName: 'kv-store',
    init() {
        return new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = (e: any) => {
                e.target.result.createObjectStore(this.storeName);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async get<T>(key: string, fallback: T): Promise<T> {
        try {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback);
                req.onerror = () => resolve(fallback);
            });
        } catch {
            return fallback;
        }
    },
    async set(key: string, value: any): Promise<void> {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error('IDB Set Error', e);
        }
    },
    async remove(key: string): Promise<void> {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error('IDB Remove Error', e);
        }
    }
};
