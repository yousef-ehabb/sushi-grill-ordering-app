module.exports = async function (request) {
    try {
        const body = await request.json();
        const { items } = body; // items: [{ product_id, category_id, quantity }]
        const errors = [];

        // 1. Check website status
        const { rows: settingsRows } = await this.database.query(
            'SELECT is_website_open, closed_message FROM global_settings LIMIT 1'
        );

        if (!settingsRows || settingsRows.length === 0 || !settingsRows[0].is_website_open) {
            const message = settingsRows?.[0]?.closed_message || 'المطعم مغلق حالياً';
            return new Response(JSON.stringify({
                valid: false,
                error: message,
                code: 'WEBSITE_CLOSED'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return new Response(JSON.stringify({
                valid: false,
                error: 'الطلب فارغ',
                code: 'EMPTY_ORDER'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. Get all relevant category IDs
        const categoryIds = [...new Set(items.map(i => i.category_id))];

        // 3. Check category active status
        const { rows: categories } = await this.database.query(
            `SELECT id, name_ar, is_active FROM categories WHERE id = ANY($1)`,
            [categoryIds]
        );

        const categoryMap = {};
        for (const cat of categories) {
            categoryMap[cat.id] = cat;
            if (!cat.is_active) {
                errors.push(`قسم "${cat.name_ar}" غير متاح حالياً`);
            }
        }

        // 4. Check product availability
        const productIds = items.map(i => i.product_id);
        const { rows: products } = await this.database.query(
            `SELECT id, name_ar, is_available FROM products WHERE id = ANY($1)`,
            [productIds]
        );

        const productMap = {};
        for (const prod of products) {
            productMap[prod.id] = prod;
            if (!prod.is_available) {
                errors.push(`"${prod.name_ar}" غير متوفر حالياً`);
            }
        }

        // 5. Check minimum quantity rules
        const { rows: rules } = await this.database.query(
            `SELECT category_id, min_quantity FROM business_rules WHERE category_id = ANY($1)`,
            [categoryIds]
        );

        const ruleMap = {};
        for (const rule of rules) {
            ruleMap[rule.category_id] = rule.min_quantity;
        }

        // Aggregate quantities per category
        const categoryQuantities = {};
        for (const item of items) {
            if (!categoryQuantities[item.category_id]) {
                categoryQuantities[item.category_id] = 0;
            }
            categoryQuantities[item.category_id] += item.quantity;
        }

        for (const [catId, qty] of Object.entries(categoryQuantities)) {
            const minQty = ruleMap[catId] || 1;
            if (minQty > 1 && qty < minQty) {
                const catName = categoryMap[catId]?.name_ar || catId;
                errors.push(`الحد الأدنى لقسم "${catName}" هو ${minQty} قطع`);
            }
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                valid: false,
                errors,
                code: 'VALIDATION_FAILED'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ valid: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            valid: false,
            error: 'حدث خطأ في التحقق من الطلب',
            code: 'INTERNAL_ERROR'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};
