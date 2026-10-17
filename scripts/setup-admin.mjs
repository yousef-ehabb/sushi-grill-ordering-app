const BASE_URL = process.env.INSFORGE_BASE_URL;
const ANON_KEY = process.env.INSFORGE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!BASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Missing required environment variables: INSFORGE_BASE_URL, INSFORGE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD');
    process.exit(1);
}

async function main() {
    // 1. Register admin user
    console.log('Registering admin...');
    const signupRes = await fetch(`${BASE_URL}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            name: 'Admin'
        })
    });

    const signupData = await signupRes.json();
    console.log('Signup status:', signupRes.status);

    let userId = signupData.user?.id;

    if (!userId) {
        // Try sign in if already exists
        console.log('Trying sign in...');
        const loginRes = await fetch(`${BASE_URL}/api/auth/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD
            })
        });
        const loginData = await loginRes.json();
        userId = loginData.user?.id;
    }

    if (!userId) {
        console.error('Could not get user ID');
        return;
    }

    console.log('User ID:', userId);

    // 2. Insert into admin_users via PostgREST
    console.log('Inserting admin record...');
    const insertRes = await fetch(`${BASE_URL}/api/database/admin_users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            user_id: userId,
            username: 'admin',
            email: ADMIN_EMAIL
        })
    });

    console.log('Insert status:', insertRes.status);
    const insertData = await insertRes.text();
    console.log('Insert result:', insertData);
    console.log('Done!');
}

main().catch(e => console.error('Error:', e.message));
