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
            client_total,
        } = body;

        const errors = [];

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

        if (!items || !Array.isArray(items) || items.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'الطلب فارغ',
                code: 'EMPTY_ORDER',
            }), { status: 400, headers });
        }

        const validatedItems = [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const quantity = Number(item?.quantity);

            if (!item || item.product_id == null || item.category_id == null || !Number.isInteger(quantity) || quantity <= 0) {
                errors.push(`بيانات عنصر غير صالحة عند الفهرس ${index} (product_id/category_id/quantity)`);
                continue;
            }

            validatedItems.push({
                product_id: item.product_id,
                category_id: item.category_id,
                quantity,
                selected_option_ids: Array.isArray(item.selected_option_ids)
                    ? item.selected_option_ids.filter((id) => typeof id === 'string')
                    : [],
                special_instructions: typeof item.special_instructions === 'string'
                    ? item.special_instructions.trim().slice(0, 200)
                    : undefined,
                index,
            });
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                errors,
                code: 'VALIDATION_FAILED',
            }), { status: 400, headers });
        }

        const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
        const anonKey = Deno.env.get('ANON_KEY');
        if (typeof baseUrl !== 'string' || baseUrl.trim() === '' || typeof anonKey !== 'string' || anonKey.trim() === '') {
            console.error('place-order: missing INSFORGE_BASE_URL or ANON_KEY');
            return new Response(JSON.stringify({
                success: false,
                error: 'Server configuration error (INSFORGE_BASE_URL/ANON_KEY)',
                code: 'CONFIG_ERROR',
            }), { status: 500, headers });
        }

        const client = createClient({
            baseUrl,
            anonKey,
        });

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
                code: 'WEBSITE_CLOSED',
            }), { status: 400, headers });
        }

        const categoryIds = [...new Set(validatedItems.map((i) => i.category_id))];
        const productIds = [...new Set(validatedItems.map((i) => i.product_id))];

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
        for (const item of validatedItems) {
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
            groupsByProduct[group.product_id].push({
                id: group.id,
                product_id: group.product_id,
                name_ar: group.name_ar,
                min_select: group.min_select,
                max_select: group.max_select,
                product_options: group.product_options || [],
            });
        }

        let computedTotal = 0;
        const itemsToInsert = [];

        for (const item of validatedItems) {
            const product = productMap[item.product_id];
            if (!product) {
                errors.push(`منتج غير معروف عند الفهرس ${item.index} (product_id: ${item.product_id})`);
                continue;
            }

            if (!categoryMap[item.category_id]) {
                errors.push(`قسم غير معروف عند الفهرس ${item.index} (category_id: ${item.category_id})`);
            }

            const itemBaseTotal = product.price * item.quantity;
            computedTotal += itemBaseTotal;

            const selectedOptions = item.selected_option_ids || [];
            const groups = groupsByProduct[item.product_id] || [];

            for (const optId of selectedOptions) {
                let found = false;
                let isActive = false;
                let priceDelta = 0;

                for (const group of groups) {
                    const opt = (group.product_options || []).find((o) => o.id === optId);
                    if (opt) {
                        found = true;
                        isActive = opt.is_active;
                        priceDelta = opt.price_delta || 0;
                        if (isActive) {
                            computedTotal += priceDelta * item.quantity;
                        }
                        break;
                    }
                }

                if (!found) {
                    errors.push(`الخيار المحدد غير متوفر للمنتج "${product.name_ar}"`);
                } else if (!isActive) {
                    errors.push(`خيار غير نشط للمنتج "${product.name_ar}"`);
                }
            }

            for (const group of groups) {
                const activeOptions = (group.product_options || []).filter((o) => o.is_active);
                const activeOptionIds = activeOptions.map((o) => o.id);
                const groupSelections = selectedOptions.filter((id) => activeOptionIds.includes(id));

                if (groupSelections.length < group.min_select) {
                    errors.push(`يرجى اختيار ${group.min_select} صنف على الأقل من "${group.name_ar}"`);
                }
                if (groupSelections.length > group.max_select) {
                    errors.push(`يمكنك اختيار ${group.max_select} صنف بحد أقصى من "${group.name_ar}"`);
                }
            }

            const unitOptionsTotal = selectedOptions.reduce((sum, optId) => {
                for (const group of groups) {
                    const opt = (group.product_options || []).find((o) => o.id === optId);
                    if (opt && opt.is_active) {
                        return sum + (opt.price_delta || 0);
                    }
                }
                return sum;
            }, 0);

            const unitPrice = product.price + unitOptionsTotal;

            itemsToInsert.push({
                product_id: item.product_id,
                name_ar: product.name_ar,
                quantity: item.quantity,
                unit_price: unitPrice,
                special_instructions: item.special_instructions || null,
                selected_option_ids: selectedOptions.length > 0 ? selectedOptions : null,
            });
        }

        if (client_total !== undefined && Math.abs(computedTotal - Number(client_total)) > 1) {
            errors.push('خطأ في حساب السعر الإجمالي');
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                errors,
                code: 'VALIDATION_FAILED',
            }), { status: 400, headers });
        }

        const { data: orderData, error: orderErr } = await client.database.rpc('create_order_with_items', {
            p_customer_name: customer_name.trim(),
            p_customer_phone: customer_phone.trim(),
            p_address: address?.trim() || null,
            p_user_id: user_id || null,
            p_type: type,
            p_total: computedTotal,
            p_items: itemsToInsert,
        });

        if (orderErr) {
            throw orderErr;
        }

        const createdOrder = Array.isArray(orderData) ? orderData[0] : orderData;
        if (!createdOrder?.id) {
            throw new Error('Order transaction did not return an order id');
        }

        return new Response(JSON.stringify({
            success: true,
            order_id: createdOrder.id,
            created_at: createdOrder.created_at,
            total: computedTotal,
        }), { status: 200, headers });

    } catch (err) {
        console.error('place-order error:', err);
        return new Response(JSON.stringify({
            success: false,
            error: 'حدث خطأ في إنشاء الطلب',
            code: 'INTERNAL_ERROR',
        }), { status: 500, headers });
    }
}

