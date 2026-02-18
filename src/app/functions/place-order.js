import { createClient } from 'npm:@insforge/sdk';

export default async function (req) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

    try {
        const body = await req.json();
        const {
            customer_name,
            customer_phone,
            address,
            user_id,
            type,
            items,
            client_total
        } = body;

        const errors = [];

        // 0. Input validation
        if (!customer_name || typeof customer_name !== 'string' || customer_name.trim().length === 0) {
            errors.push('الاسم مطلوب');
        } else if (customer_name.trim().length > 200) {
            errors.push('الاسم طويل جداً (الحد الأقصى 200 حرف)');
        }

        if (!customer_phone || typeof customer_phone !== 'string' || customer_phone.trim().length === 0) {
            errors.push('رقم الهاتف مطلوب');
        } else if (customer_phone.trim().length > 20) {
            errors.push('رقم الهاتف طويل جداً (الحد الأقصى 20 حرف)');
        }

        if (!type || (type !== 'pickup' && type !== 'delivery')) {
            errors.push('نوع الطلب غير صالح');
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                errors,
                code: 'VALIDATION_FAILED'
            }), { status: 400, headers });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'الطلب فارغ',
                code: 'EMPTY_ORDER'
            }), { status: 400, headers });
        }

        // Create InsForge client
        const client = createClient({
            baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
            anonKey: Deno.env.get('ANON_KEY'),
        });

        // 1. Check website status
        const { data: settingsData, error: settingsErr } = await client.database
            .from('global_settings')
            .select('is_website_open, closed_message')
            .limit(1)
            .maybeSingle();

        if (settingsErr) throw settingsErr;

        if (!settingsData || !settingsData.is_website_open) {
            const message = settingsData?.closed_message || 'المطعم مغلق حالياً';
            return new Response(JSON.stringify({
                success: false,
                error: message,
                code: 'WEBSITE_CLOSED'
            }), { status: 400, headers });
        }

        // 2. Get unique category and product IDs
        const categoryIds = [...new Set(items.map(i => i.category_id))];
        const productIds = items.map(i => i.product_id);

        // 3. Check category active status
        const { data: categories, error: catErr } = await client.database
            .from('categories')
            .select('id, name_ar, is_active')
            .in('id', categoryIds);

        if (catErr) throw catErr;

        const categoryMap = {};
        for (const cat of (categories || [])) {
            categoryMap[cat.id] = cat;
            if (!cat.is_active) {
                errors.push(`قسم "${cat.name_ar}" غير متاح حالياً`);
            }
        }

        // 4. Check product availability and get base prices
        const { data: products, error: prodErr } = await client.database
            .from('products')
            .select('id, name_ar, is_available, price')
            .in('id', productIds);

        if (prodErr) throw prodErr;

        const productMap = {};
        for (const prod of (products || [])) {
            productMap[prod.id] = prod;
            if (!prod.is_available) {
                errors.push(`"${prod.name_ar}" غير متوفر حالياً`);
            }
        }

        // 5. Check minimum quantity rules
        const { data: rules, error: rulesErr } = await client.database
            .from('business_rules')
            .select('category_id, min_quantity')
            .in('category_id', categoryIds);

        if (rulesErr) throw rulesErr;

        const ruleMap = {};
        for (const rule of (rules || [])) {
            ruleMap[rule.category_id] = rule.min_quantity;
        }

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

        // 6. Get option groups and options for ordered products
        const { data: optionGroupsRaw, error: ogErr } = await client.database
            .from('product_option_groups')
            .select('id, product_id, name_ar, min_select, max_select, is_active, product_options(id, name_ar, price_delta, is_active)')
            .in('product_id', productIds)
            .eq('is_active', true);

        if (ogErr) throw ogErr;

        const groupsByProduct = {};
        for (const group of (optionGroupsRaw || [])) {
            if (!groupsByProduct[group.product_id]) {
                groupsByProduct[group.product_id] = [];
            }
            const activeOptions = (group.product_options || []).filter(o => o.is_active);
            groupsByProduct[group.product_id].push({
                id: group.id,
                product_id: group.product_id,
                name_ar: group.name_ar,
                min_select: group.min_select,
                max_select: group.max_select,
                options: activeOptions,
            });
        }

        // 7. Validate options per item and compute total
        let computedTotal = 0;
        const itemsToInsert = [];

        for (const item of items) {
            const product = productMap[item.product_id];
            if (!product) continue;

            const itemBaseTotal = product.price * item.quantity;
            computedTotal += itemBaseTotal;

            const selectedOptions = item.selected_option_ids || [];
            const groups = groupsByProduct[item.product_id] || [];

            for (const optId of selectedOptions) {
                let found = false;
                let isActive = false;
                let priceDelta = 0;

                for (const group of groups) {
                    const opt = group.options.find(o => o.id === optId);
                    if (opt) {
                        found = true;
                        isActive = opt.is_active;
                        priceDelta = opt.price_delta || 0;
                        computedTotal += priceDelta * item.quantity;
                        break;
                    }
                }

                if (!found) {
                    errors.push(`الخيار المحدد غير متوفر للمنتج "${product.name_ar}"`);
                } else if (!isActive) {
                    errors.push(`صوص "${product.name_ar}" غير متوفر حالياً`);
                }
            }

            // Validate min/max selection per group
            for (const group of groups) {
                const groupSelections = selectedOptions.filter(id =>
                    group.options.some(o => o.id === id)
                );

                if (groupSelections.length < group.min_select) {
                    errors.push(`يرجى اختيار ${group.min_select} صنف على الأقل من "${group.name_ar}"`);
                }
                if (groupSelections.length > group.max_select) {
                    errors.push(`يمكنك اختيار ${group.max_select} صنف بحد أقصى من "${group.name_ar}"`);
                }
            }

            const unitPrice = product.price + (selectedOptions.reduce((sum, optId) => {
                for (const group of groups) {
                    const opt = group.options.find(o => o.id === optId);
                    if (opt) return sum + (opt.price_delta || 0);
                }
                return sum;
            }, 0));

            itemsToInsert.push({
                product_id: item.product_id,
                name_ar: product.name_ar,
                quantity: item.quantity,
                unit_price: unitPrice,
                special_instructions: item.special_instructions || null,
                selected_option_ids: selectedOptions.length > 0 ? selectedOptions : null,
            });
        }

        // 8. Verify total matches
        if (client_total !== undefined && Math.abs(computedTotal - client_total) > 1) {
            errors.push('خطأ في حساب السعر الإجمالي');
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                errors,
                code: 'VALIDATION_FAILED'
            }), { status: 400, headers });
        }

        // 9. Create order (no stock tracking)
        const { data: orderData, error: orderErr } = await client.database
            .from('orders')
            .insert({
                customer_name: customer_name.trim(),
                customer_phone: customer_phone.trim(),
                address: address?.trim() || null,
                user_id: user_id || null,
                type,
                total: computedTotal,
                status: 'new',
            })
            .select('id, created_at')
            .single();

        if (orderErr) throw orderErr;

        const orderId = orderData.id;
        const createdAt = orderData.created_at;

        // 10. Insert order items
        const orderItems = itemsToInsert.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            name_ar: item.name_ar,
            quantity: item.quantity,
            unit_price: item.unit_price,
            special_instructions: item.special_instructions,
            selected_option_ids: item.selected_option_ids,
        }));

        const { error: itemsErr } = await client.database
            .from('order_items')
            .insert(orderItems);

        if (itemsErr) {
            // Rollback: delete the order if items fail
            await client.database.from('orders').delete().eq('id', orderId);
            throw itemsErr;
        }

        return new Response(JSON.stringify({
            success: true,
            order_id: orderId,
            created_at: createdAt,
            total: computedTotal,
        }), { status: 200, headers });

    } catch (err) {
        console.error('place-order error:', err);
        return new Response(JSON.stringify({
            success: false,
            error: 'حدث خطأ في إنشاء الطلب',
            detail: err?.message || String(err),
            code: 'INTERNAL_ERROR'
        }), { status: 500, headers });
    }
}
