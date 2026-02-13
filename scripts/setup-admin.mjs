const BASE_URL = 'https://m3ecd7r6.eu-central.insforge.app';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDAwMDZ9.EamPCz5DU16vxYY59G4VbKeShIaDgjP5ZeXaDww6z24';

async function main() {
    // 1. Register admin user
    console.log('Registering admin...');
    const signupRes = await fetch(`${BASE_URL}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'admin@sushigrill.app',
            password: 'SushiAdmin2026!',
            name: 'Admin'
        })
    });

    const signupData = await signupRes.json();
    console.log('Signup:', JSON.stringify(signupData, null, 2));

    let userId = signupData.user?.id;

    if (!userId) {
        // Try sign in if already exists
        console.log('Trying sign in...');
        const loginRes = await fetch(`${BASE_URL}/api/auth/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@sushigrill.app',
                password: 'SushiAdmin2026!'
            })
        });
        const loginData = await loginRes.json();
        console.log('Login:', JSON.stringify(loginData, null, 2));
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
            email: 'admin@sushigrill.app'
        })
    });

    console.log('Insert status:', insertRes.status);
    const insertData = await insertRes.text();
    console.log('Insert result:', insertData);
    console.log('Done!');
}

main().catch(e => console.error('Error:', e.message));
