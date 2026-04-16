require('dotenv').config();
const PLAY = {
    clientId: process.env.PLAY_CLIENT_ID,
    clientSecret: process.env.PLAY_CLIENT_SECRET,
    phoneNumber: process.env.PLAY_PHONE_NUMBER,
    apiBase: process.env.PLAY_API_BASE || 'https://uslugidlafirm.play.pl',
};

console.log('Config:', { clientId: PLAY.clientId ? 'SET' : 'MISSING', secret: PLAY.clientSecret ? 'SET' : 'MISSING', phone: PLAY.phoneNumber, apiBase: PLAY.apiBase });

async function test() {
    // 1. Authenticate
    const credentials = Buffer.from(`${PLAY.clientId}:${PLAY.clientSecret}`).toString('base64');
    console.log('\n--- Auth request ---');
    try {
        const authRes = await fetch(`${PLAY.apiBase}/oauth/token-jwt`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
        });
        console.log('Auth status:', authRes.status);
        if (!authRes.ok) {
            const txt = await authRes.text();
            console.log('Auth ERROR body:', txt.substring(0, 200));
            return;
        }
        const authData = await authRes.json();
        console.log('Token OK, expires_in:', authData.expires_in);
        
        // 2. Get call history
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
        const fromDate = `${today} 07:00`;
        const toDate = `${today} 16:00`;
        const url = `${PLAY.apiBase}/api/wirtualnacentralka/getCallHistory?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`;
        console.log('\n--- Call history request ---');
        console.log('URL:', url);
        
        const callRes = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
        });
        console.log('Call history status:', callRes.status);
        const callData = await callRes.json();
        const calls = callData.calls || [];
        console.log('Total calls returned:', calls.length);
        if (calls.length > 0) {
            console.log('First call sample:', JSON.stringify(calls[0]).substring(0, 300));
            console.log('Last call sample:', JSON.stringify(calls[calls.length-1]).substring(0, 300));
        } else {
            console.log('Response keys:', Object.keys(callData));
            console.log('Full response (first 500):', JSON.stringify(callData).substring(0, 500));
        }
    } catch (err) {
        console.log('ERROR:', err.message);
    }
}
test();
