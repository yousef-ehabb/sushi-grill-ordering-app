import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';

/**
 * Resolves an array of product option IDs to their Arabic names.
 * Fetches from Firestore to ensure accuracy even if options are not in local cache.
 */
export const resolveOptionNames = async (optionIds: string[]): Promise<string[]> => {
    if (!optionIds || optionIds.length === 0) return [];
    if (!isFirebaseConfigured() || !db) return [];

    try {
        // Firestore 'in' queries support max 30 items per batch
        const batches: string[][] = [];
        for (let i = 0; i < optionIds.length; i += 30) {
            batches.push(optionIds.slice(i, i + 30));
        }

        const nameMap = new Map<string, string>();

        for (const batch of batches) {
            const q = query(
                collection(db, 'options'),
                where(documentId(), 'in', batch)
            );
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.name_ar) {
                    nameMap.set(doc.id, data.name_ar);
                }
            });
        }

        return optionIds.map(id => nameMap.get(id)).filter(Boolean) as string[];
    } catch (error) {
        console.error('Error resolving option names:', error);
        return [];
    }
};

/**
 * Resolves options for multiple items in a single query.
 * Returns a map of optionId -> name_ar
 */
export const resolveAllOptionNames = async (allItemsOptionIds: string[][]): Promise<Map<string, string>> => {
    const uniqueIds = Array.from(new Set(allItemsOptionIds.flat()));
    if (uniqueIds.length === 0) return new Map();
    if (!isFirebaseConfigured() || !db) return new Map();

    try {
        const nameMap = new Map<string, string>();

        // Firestore 'in' queries support max 30 items per batch
        const batches: string[][] = [];
        for (let i = 0; i < uniqueIds.length; i += 30) {
            batches.push(uniqueIds.slice(i, i + 30));
        }

        for (const batch of batches) {
            const q = query(
                collection(db, 'options'),
                where(documentId(), 'in', batch)
            );
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.name_ar) {
                    nameMap.set(doc.id, data.name_ar);
                }
            });
        }

        return nameMap;
    } catch (error) {
        console.error('Error resolving multiple option names:', error);
        return new Map();
    }
};
