require('dotenv').config();
async function test() {
    const credentials = Buffer.from(`${process.env.PLAY_CLIENT_ID}:${process.env.PLAY_CLIENT_SECRET}`).toString('base64');
    const authRes = await fetch(`https://uslugidlafirm.play.pl/oauth/token-jwt`, {
        method: 'POST', headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
    });
    const { access_token } = await authRes.json();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
    const res = await fetch(`https://uslugidlafirm.play.pl/api/wirtualnacentralka/getCallHistory?fromDate=${encodeURIComponent(today + ' 07:00')}&toDate=${encodeURIComponent(today + ' 16:00')}`, {
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    const calls = data.calls || [];
    console.log('Total:', calls.length);
    console.log('\nFULL first call:\n', JSON.stringify(calls[0], null, 2));
    console.log('\nFULL second call:\n', JSON.stringify(calls[1], null, 2));
    // Find one with duration
    const withDuration = calls.find(c => c.duration || c.callDuration || c.durationSeconds);
    console.log('\nCall with duration field:', withDuration ? JSON.stringify(withDuration, null, 2) : 'NONE FOUND');
    console.log('\nAll keys in first call:', Object.keys(calls[0]));
}
test();
