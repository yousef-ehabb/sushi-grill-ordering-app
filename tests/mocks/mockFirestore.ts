export interface MockDocData {
  [key: string]: any;
}

export class MockFirestore {
  private collections: Map<string, Map<string, MockDocData>> = new Map();
  public transactionCalls = 0;

  constructor(initialData?: Record<string, Record<string, MockDocData>>) {
    if (initialData) {
      for (const [colName, docs] of Object.entries(initialData)) {
        const colMap = new Map<string, MockDocData>();
        for (const [docId, data] of Object.entries(docs)) {
          colMap.set(docId, JSON.parse(JSON.stringify(data)));
        }
        this.collections.set(colName, colMap);
      }
    }
  }

  getCollection(name: string): Map<string, MockDocData> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name)!;
  }

  collection(name: string) {
    const self = this;
    return {
      doc(id?: string) {
        const docId = id || 'mock_doc_' + Math.random().toString(36).substring(2, 9);
        return {
          id: docId,
          async get() {
            const col = self.getCollection(name);
            const data = col.get(docId);
            return {
              id: docId,
              exists: !!data,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            };
          },
          async set(data: any, options?: { merge?: boolean }) {
            const col = self.getCollection(name);
            if (options?.merge && col.has(docId)) {
              col.set(docId, { ...col.get(docId), ...data });
            } else {
              col.set(docId, JSON.parse(JSON.stringify(data)));
            }
          },
        };
      },
    };
  }

  private txQueue: Promise<any> = Promise.resolve();

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    this.transactionCalls++;
    const self = this;

    const execute = async () => {
      const pendingWrites: Array<() => void> = [];

      const transaction = {
        async get(docRef: any) {
          return docRef.get();
        },
        set(docRef: any, data: any, options?: any) {
          pendingWrites.push(() => {
            docRef.set(data, options);
          });
        },
        update(docRef: any, data: any) {
          pendingWrites.push(() => {
            docRef.set(data, { merge: true });
          });
        },
        delete(docRef: any) {
          // no-op
        },
      };

      const result = await updateFunction(transaction);
      for (const write of pendingWrites) {
        await write();
      }
      return result;
    };

    const nextTx = this.txQueue.then(execute, execute);
    this.txQueue = nextTx;
    return nextTx;
  }
}

export const mockFieldValue = {
  serverTimestamp: () => new Date().toISOString(),
};
