const axios = require('axios');
require('dotenv').config();

const BRIDGE_URL = process.env.BRIDGE_PROXY_URL || 'https://uslugi.faktura-nt.pl';
let currentToken = null;

async function authenticate() {
    try {
        const res = await axios.post(`${BRIDGE_URL}/auth/login`, {
            username: process.env.BRIDGE_USERNAME,
            password: process.env.BRIDGE_PASSWORD
        });
        currentToken = res.data.accessToken;
        console.log('[BridgeClient] Successfully authenticated');
    } catch (err) {
        console.error('[BridgeClient] Auth failed:', err.message);
        throw new Error('Bridge authentication failed');
    }
}

async function queryAgent(target, action, params) {
    if (!currentToken) await authenticate();

    try {
        const res = await axios.post(`${BRIDGE_URL}/api/query`, {
            target,
            action,
            params
        }, {
            headers: { Authorization: `Bearer ${currentToken}` },
            timeout: 15000 // 15s timeout (procedures take longer than reads)
        });
        return res.data;
    } catch (err) {
        if (err.response && err.response.status === 401) {
            console.log('[BridgeClient] Token expired, repeating auth...');
            await authenticate();
            const res = await axios.post(`${BRIDGE_URL}/api/query`, {
                target, action, params
            }, {
                headers: { Authorization: `Bearer ${currentToken}` },
                timeout: 15000
            });
            return res.data;
        }
        throw err;
    }
}

/**
 * Get product pricing from Sapio TOWARY.
 * totalBrutto is ALWAYS computed from this data — never from frontend.
 * @param {number} towarKod - Sapio TOWARY.KOD
 * @returns {Promise<{KOD, NAZWA, CENA_NETTO, CENA_BRUTTO, VAT}|null>}
 */
async function getProductPricing(towarKod) {
    const res = await queryAgent('sapio', 'products/pricing', { towarKod: String(towarKod) });
    if (res.status !== 'ok' || !res.data?.data?.length) return null;
    return res.data.data[0];
}

/**
 * Lookup contractor by NIP in Sapio — MANDATORY guard before orders/create.
 * @param {string} nip - 10-digit NIP (no dashes)
 * @returns {Promise<{NAZWA, EMAIL, NIP}|null>}
 */
async function contractorLookup(nip) {
    const res = await queryAgent('sapio', 'contractors/lookup', { nip });
    if (res.status !== 'ok' || !res.data?.data?.length) return null;
    return res.data.data[0];
}

/**
 * Create order in Sapio via Bridge procedure.
 * Prices come from products/pricing, NOT from frontend input.
 * @param {object} params - All parameters for orders/create capability
 * @returns {Promise<{orderId, orderNumber, kontrahentKod, kontrahentNazwa, success}>}
 */
async function createOrder(params) {
    const res = await queryAgent('sapio', 'orders/create', params);

    if (res.status !== 'ok') {
        throw new Error(`Bridge orders/create failed: ${res.error?.message || JSON.stringify(res)}`);
    }

    // Parse response: find summary step
    const steps = res.data?.data || [];
    const summary = steps.find(s => s.stepId === 'summary');
    if (!summary || !summary.data || !summary.data.length) {
        const header = steps.find(s => s.stepId === 'insertHeader');
        if (!header || header.affectedRows !== 1) {
            throw new Error('Order creation failed: header INSERT returned 0 rows');
        }
        return { orderId: null, orderNumber: null, success: true };
    }

    const row = summary.data[0];
    return {
        orderId: row.ORDER_ID,
        orderNumber: row.ORDER_NUMBER,
        kontrahentKod: row.KONTRAHENT_KOD,
        kontrahentNazwa: row.KONTRAHENT_NAZWA,
        success: true,
    };
}

module.exports = { queryAgent, getProductPricing, contractorLookup, createOrder };
