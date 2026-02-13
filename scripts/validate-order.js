import { createClient } from "npm:@insforge/sdk";

export default async function (request) {
    try {
        const body = await request.json();
        const { items } = body;
        const errors = [];

        // Create InsForge client inside the function
        const client = createClient({
            baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
            anonKey: Deno.env.get("ANON_KEY"),
        });

        // 1. Check website status
        const { data: settingsData, error: settingsError } = await client.database
            .from("global_settings")
            .select("is_website_open, closed_message")
            .limit(1);

        if (settingsError) {
            return new Response(
                JSON.stringify({
                    valid: false,
                    error: "خطأ في الاتصال بقاعدة البيانات",
                    code: "DB_ERROR",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        if (
            !settingsData ||
            settingsData.length === 0 ||
            !settingsData[0].is_website_open
        ) {
            const message =
                settingsData?.[0]?.closed_message || "المطعم مغلق حالياً";
            return new Response(
                JSON.stringify({
                    valid: false,
                    error: message,
                    code: "WEBSITE_CLOSED",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return new Response(
                JSON.stringify({
                    valid: false,
                    error: "الطلب فارغ",
                    code: "EMPTY_ORDER",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // 2. Get all relevant category IDs
        const categoryIds = [...new Set(items.map((i) => i.category_id))];

        // 3. Check category active status
        const { data: categories, error: catError } = await client.database
            .from("categories")
            .select("id, name_ar, is_active")
            .in("id", categoryIds);

        if (catError) {
            return new Response(
                JSON.stringify({
                    valid: false,
                    error: "خطأ في التحقق من الأقسام",
                    code: "DB_ERROR",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        const categoryMap = {};
        for (const cat of categories || []) {
            categoryMap[cat.id] = cat;
            if (!cat.is_active) {
                errors.push(`قسم "${cat.name_ar}" غير متاح حالياً`);
            }
        }

        // 4. Check product availability
        const productIds = items.map((i) => i.product_id);
        const { data: products, error: prodError } = await client.database
            .from("products")
            .select("id, name_ar, is_available")
            .in("id", productIds);

        if (prodError) {
            return new Response(
                JSON.stringify({
                    valid: false,
                    error: "خطأ في التحقق من المنتجات",
                    code: "DB_ERROR",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        const productMap = {};
        for (const prod of products || []) {
            productMap[prod.id] = prod;
            if (!prod.is_available) {
                errors.push(`"${prod.name_ar}" غير متوفر حالياً`);
            }
        }

        // 5. Check minimum quantity rules
        const { data: rules, error: rulesError } = await client.database
            .from("business_rules")
            .select("category_id, min_quantity")
            .in("category_id", categoryIds);

        if (rulesError) {
            return new Response(
                JSON.stringify({
                    valid: false,
                    error: "خطأ في التحقق من قواعد الحد الأدنى",
                    code: "DB_ERROR",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        const ruleMap = {};
        for (const rule of rules || []) {
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
            return new Response(
                JSON.stringify({
                    valid: false,
                    errors,
                    code: "VALIDATION_FAILED",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(JSON.stringify({ valid: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(
            JSON.stringify({
                valid: false,
                error: "حدث خطأ في التحقق من الطلب: " + (err.message || String(err)),
                code: "INTERNAL_ERROR",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    }
}
