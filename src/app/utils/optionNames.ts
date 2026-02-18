import { insforge } from '../../lib/insforge';

/**
 * Resolves an array of product option IDs to their Arabic names.
 * Fetches from the database to ensure accuracy even if options are not in local cache.
 */
export const resolveOptionNames = async (optionIds: string[]): Promise<string[]> => {
    if (!optionIds || optionIds.length === 0) return [];

    const { data, error } = await insforge.database
        .from('product_options')
        .select('id, name_ar')
        .in('id', optionIds);

    if (error) {
        console.error('Error resolving option names:', error);
        return [];
    }

    // Sort back to match request order if possible, or just return names
    // Usually, comma-separated names don't need strict ordering but consistency is good.
    const nameMap = new Map((data || []).map(o => [o.id, o.name_ar]));
    return optionIds.map(id => nameMap.get(id)).filter(Boolean) as string[];
};

/**
 * Resolves options for multiple items in a single query.
 * Returns a map of optionId -> name_ar
 */
export const resolveAllOptionNames = async (allItemsOptionIds: string[][]): Promise<Map<string, string>> => {
    const uniqueIds = Array.from(new Set(allItemsOptionIds.flat()));
    if (uniqueIds.length === 0) return new Map();

    const { data, error } = await insforge.database
        .from('product_options')
        .select('id, name_ar')
        .in('id', uniqueIds);

    if (error) {
        console.error('Error resolving multiple option names:', error);
        return new Map();
    }

    return new Map((data || []).map(o => [o.id, o.name_ar]));
};
