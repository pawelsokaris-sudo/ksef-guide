/**
 * KSeF Guide — Ticket API
 * Micro-service for client feedback/tickets
 * Runs on port 3091, proxied via Caddy at /api/*
 */
const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { queryAgent } = require('./bridgeClient');
require('dotenv').config();

// Privacy: mask email — show first 3 chars + **** + domain
function maskEmail(email) {
    if (!email || !email.includes('@')) return null;
    const [local, domain] = email.split('@');
    const visible = local.substring(0, Math.min(3, local.length));
    return `${visible}****@${domain}`;
}

const app = express();
app.set('trust proxy', 1); // Caddy reverse proxy — needed for rate limiter IP detection

const PORT = 3091;
const DB_PATH = path.join(__dirname, 'tickets.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Init DB
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    article_id TEXT,
    nip TEXT,
    email TEXT,
    phone TEXT,
    program_version TEXT,
    description TEXT NOT NULL,
    screenshot_path TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    status TEXT DEFAULT 'new'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS web_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nip TEXT,
    scenario TEXT,
    result_status TEXT NOT NULL,
    email_provided TEXT,
    phone_provided TEXT,
    company_provided TEXT,
    comments TEXT,
    order_number TEXT,
    order_id TEXT,
    total_brutto REAL,
    products_json TEXT,
    error_message TEXT,
    source_page TEXT DEFAULT 'ksef.faktura-nt.pl',
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  )
`);

function logIntent({ nip, scenario, resultStatus, email, phone, company, comments, orderNumber, orderId, totalBrutto, products, error, req }) {
    try {
        db.prepare(`
            INSERT INTO web_intents (nip, scenario, result_status, email_provided, phone_provided, company_provided, comments, order_number, order_id, total_brutto, products_json, error_message, ip, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            nip || null, scenario || null, resultStatus,
            email || null, phone || null, company || null, comments || null,
            orderNumber || null, orderId || null, totalBrutto || null,
            products ? JSON.stringify(products) : null,
            error || null,
            req?.ip || req?.connection?.remoteAddress || null,
            req?.headers?.['user-agent'] || null
        );
    } catch (err) {
        console.error('[INTENT] Failed to log intent:', err.message);
    }
}

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 's29.cyber-folks.pl',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Rate limiter — per IP, 30 req/min (check-nip + order combined)
const nipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Przekroczono limit zapytań. Spróbuj ponownie za chwilę.' }
});

// File upload config
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Generate ticket ID: KS-YYMMDD-NNN
function generateTicketId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `KS-${yy}${mm}${dd}`;

  const row = db.prepare(`SELECT COUNT(*) as cnt FROM tickets WHERE ticket_id LIKE ?`).get(`${prefix}%`);
  const seq = String((row.cnt || 0) + 1).padStart(3, '0');
  return `${prefix}-${seq}`;
}

// POST /api/ticket (multipart/form-data for screenshot support)
app.post('/api/ticket', upload.single('screenshot'), (req, res) => {
  try {
    const { article_id, nip, email, phone, program_version, description } = req.body;

    if (!description || description.trim().length < 5) {
      return res.status(400).json({ error: 'Opis problemu jest za krótki (min. 5 znaków).' });
    }

    const ticket_id = generateTicketId();
    const ua = req.headers['user-agent'] || '';
    const screenshot_path = req.file ? req.file.filename : null;

    db.prepare(`
      INSERT INTO tickets (ticket_id, article_id, nip, email, phone, program_version, description, screenshot_path, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticket_id,
      article_id || null,
      nip || null,
      email || null,
      phone || null,
      program_version || null,
      description.trim(),
      screenshot_path,
      ua
    );

    console.log(`[TICKET] ${ticket_id} | NIP:${nip||'-'} | art:${article_id||'-'} | ver:${program_version||'-'} | ${description.trim().substring(0, 60)}`);

    res.json({
      ticketId: ticket_id,
      message: `Dziękujemy! Twój numer zgłoszenia: ${ticket_id}. Skontaktujemy się wkrótce.`
    });
  } catch (err) {
    console.error('[TICKET] Error:', err.message);
    res.status(500).json({ error: 'Nie udało się utworzyć zgłoszenia. Spróbuj ponownie.' });
  }
});

// GET /api/tickets (admin — list recent)
app.get('/api/tickets', (req, res) => {
  const rows = db.prepare(`SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50`).all();
  res.json(rows);
});

// GET /api/intents — admin view of all client interactions
app.get('/api/intents', (req, res) => {
    const rows = db.prepare('SELECT * FROM web_intents ORDER BY created_at DESC LIMIT 200').all();
    res.json(rows);
});

// GET /api/intents/by-nip/:nip — lookup by NIP (for support calls)
app.get('/api/intents/by-nip/:nip', (req, res) => {
    const nip = req.params.nip.replace(/[\s\-\.]/g, '');
    const rows = db.prepare('SELECT * FROM web_intents WHERE nip = ? ORDER BY created_at DESC LIMIT 50').all(nip);
    res.json(rows);
});

// GET endpoints for NIP and Orders

app.post('/api/check-nip', nipLimiter, async (req, res) => {
  try {
    const rawNip = req.body.nip || '';
    const nip = rawNip.replace(/^PL/i, '').replace(/[\s\-\.]/g, ''); // strip PL prefix, spaces, dashes, dots
    if (!nip || !/^\d{10}$/.test(nip)) {
      return res.status(400).json({ error: 'Nieprawidłowy NIP (wymagane 10 cyfr).' });
    }

    const bridgeRes = await queryAgent('srvcauth', 'licenses/lookup', { nip });
    const _queryStart = Date.now();
    
    if (bridgeRes.status !== 'ok') {
      return res.status(500).json({ error: 'Błąd po stronie serwera licencji.' });
    }

    const data = bridgeRes.data.data || [];
    
    let hasFnt = false;
    let hasUpdate = false;
    let hasKsef = false;
    let hasFakturant = false;
    let hasFakturaJpk = false;
    let hasSapio = false;
    let customerEmail = null;
    let expiredUpdateDate = null;
    
    const now = new Date();

    for (const lic of data) {
       if (lic.BLOCKED === 1) continue;
       const isExpired = lic.VALIDDATE ? new Date(lic.VALIDDATE) < now : false;
       const name = lic.PRODUCTNAME || '';
       
       if (lic.EMAIL && !customerEmail) customerEmail = lic.EMAIL;
       
       if (name.includes('Faktura-NT') && !name.includes('aktualizacji') && !name.includes('drukarka')) {
           if (!isExpired) hasFnt = true;
       }
       if (name.includes('Dostęp do aktualizacji') || name.includes('aktualizacji')) {
           if (!isExpired) hasUpdate = true;
           else if (!expiredUpdateDate) expiredUpdateDate = lic.VALIDDATE; // capture expired date
       }
       if (name.includes('KSeF')) {
           if (!isExpired) hasKsef = true;
       }
       if (name.includes('Fakturant')) {
           if (!isExpired) hasFakturant = true;
       }
       if (name.includes('Faktura-JPK')) {
           if (!isExpired) hasFakturaJpk = true;
       }
       if (name.includes('Sapio')) {
           if (!isExpired) hasSapio = true;
       }
    }

    // Evaluate Scenario (A-G)
    let scenario = 'A';
    
    if (hasFnt) {
        if (hasUpdate && hasKsef) {
            scenario = 'C';
        } else if (hasUpdate && !hasKsef) {
            scenario = 'D';
        } else if (!hasUpdate && !hasKsef) {
            scenario = 'E';
        } else {
            scenario = 'E'; // safe fallback
        }
    } else if (hasFakturaJpk) {
        scenario = 'F';
    } else if (hasSapio) {
        scenario = 'G';
    } else if (hasFakturant) {
        scenario = 'B';
    } else {
        scenario = 'A';
    }

    // Log successful query
    const ip = req.ip || req.connection.remoteAddress || '-';
    const ms = Date.now() - _queryStart;
    console.log(`[NIP] ${new Date().toISOString()} | IP: ${ip} | NIP: ${nip} | Scenario: ${scenario} | ${ms}ms`);

    // Log intent
    logIntent({ nip, scenario, resultStatus: 'scenario-check', req });

    // Privacy: frontend receives ONLY scenario letter + public prices
    // No product names, no dates, no license details
    res.json({
        nip,
        scenario,
    });
    
  } catch (err) {
      console.error(`[NIP] ${new Date().toISOString()} | ERROR | NIP: ${req.body.nip || '?'} | ${err.message}`);
      // Graceful fallback — return scenario H instead of raw error
      // so frontend always shows a useful UI with contact form
      const nip = req.body.nip || '';
      logIntent({ nip: nip, scenario: 'H', resultStatus: 'scenario-check', error: err.message, req });
      res.json({
          nip,
          scenario: 'H',
      });
  }
});

app.post('/api/order', nipLimiter, async (req, res) => {
    try {
        const { nip, company, email, phone, scenario, comments } = req.body;

        if (!nip || !/^\d{10}$/.test(nip.replace(/[\s\-\.]/g, ''))) {
            return res.status(400).json({ error: 'Nieprawidłowy NIP.' });
        }
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Nieprawidłowy adres e-mail.' });
        }

        const { getProductsForScenario } = require('./orderConfig');
        const { getProductPricing, contractorLookup, createOrder } = require('./bridgeClient');

        // 1. Resolve products for this scenario
        const products = getProductsForScenario(scenario);
        if (!products) {
            // Scenarios C, H — no order, just send notification email
            await sendNotificationEmail({ nip, company, email, scenario, comments });
            return res.json({
                success: true,
                orderCreated: false,
                message: 'Dziękujemy! Skontaktujemy się z Tobą.'
            });
        }

        // 2. Fetch pricing from Sapio — totalBrutto computed EXCLUSIVELY from products/pricing
        const cleanNip = nip.replace(/[\s\-\.]/g, '');
        const pricedProducts = [];
        for (const p of products) {
            const pricing = await getProductPricing(p.towarKod);
            if (!pricing) {
                console.error(`[ORDER] Pricing not found for towarKod=${p.towarKod}`);
                await sendNotificationEmail({ nip, company, email, phone, scenario, comments, error: `Pricing unavailable for ${p.towarKod}` });
                logIntent({ nip: cleanNip, scenario, resultStatus: 'order-submitted', email, company, comments, error: `Pricing unavailable for ${p.towarKod}`, req });
                return res.json({
                    success: true,
                    orderCreated: false,
                    message: 'Dziękujemy! Przygotujemy ofertę i skontaktujemy się.'
                });
            }
            pricedProducts.push({
                towarKod: pricing.KOD,
                nazwa: (pricing.NAZWA || '').trim(),
                symbol: (pricing.NAZWA || '').trim().substring(0, 20),
                cenaBrutto: pricing.CENA_BRUTTO || 0,
                vat: pricing.VAT || 23,
            });
        }

        // 3. MANDATORY guard: contractor must exist in Sapio
        const kontrahent = await contractorLookup(cleanNip);
        if (!kontrahent) {
            console.log(`[ORDER] Kontrahent NIP=${cleanNip} not in Sapio — sending notification`);
            await sendNotificationEmail({ nip, company, email, phone, scenario, comments, note: 'Kontrahent nie istnieje w Sapio — wymagane ręczne utworzenie' });
            logIntent({ nip: cleanNip, scenario, resultStatus: 'order-submitted', email, phone: null, company, comments, error: 'Kontrahent not in Sapio', req });
            return res.json({
                success: true,
                orderCreated: false,
                message: 'Dziękujemy! Przygotujemy zamówienie i skontaktujemy się.'
            });
        }

        // 3b. Silent email validation against Sapio
        const sapioEmail = (kontrahent.EMAIL || '').trim().toLowerCase();
        const userEmail = (email || '').trim().toLowerCase();
        if (sapioEmail && userEmail && sapioEmail !== userEmail && !phone) {
            // Email mismatch, no phone provided — ask for phone
            logIntent({ nip: cleanNip, scenario, resultStatus: 'validation-blocked', email, company, comments, error: 'Email mismatch, phone required', req });
            return res.json({
                success: false,
                needsPhone: true,
                message: 'Podaj numer telefonu — skontaktujemy się w sprawie Twojego zamówienia.'
            });
        }

        // If phone provided (fallback flow), log it
        if (phone) {
            console.log(`[ORDER] Phone fallback: NIP=${cleanNip} phone=${phone}`);
        }

        // 4. Order suffix: W for multi-station (skip for web MVP — default single)
        const orderSuffix = '';

        // 5. Build Bridge params — prices ONLY from products/pricing, zero frontend input
        const totalBrutto = pricedProducts.reduce((s, p) => s + p.cenaBrutto, 0);
        const bridgeParams = {
            nip: cleanNip,
            orderSuffix,
            totalBrutto,
            towarKod1: String(pricedProducts[0].towarKod),
            vat1: pricedProducts[0].vat,
            cenaBrutto1: pricedProducts[0].cenaBrutto,
            nazwa1: pricedProducts[0].nazwa,
            symbol1: pricedProducts[0].symbol,
            towarKod2: pricedProducts[1] ? String(pricedProducts[1].towarKod) : null,
            vat2: pricedProducts[1]?.vat || null,
            cenaBrutto2: pricedProducts[1]?.cenaBrutto || null,
            nazwa2: pricedProducts[1]?.nazwa || null,
            symbol2: pricedProducts[1]?.symbol || null,
        };

        // 6. Create order via Bridge
        const orderResult = await createOrder(bridgeParams);
        console.log(`[ORDER] Created: NIP=${cleanNip} scenario=${scenario} order=${orderResult.orderNumber} id=${orderResult.orderId}`);

        // 7. Send notification email (best-effort — SMTP failure must NOT block success response)
        try {
            await sendNotificationEmail({
                nip, company, email, scenario, comments,
                orderNumber: orderResult.orderNumber,
                orderId: orderResult.orderId,
                totalBrutto,
                products: pricedProducts.map(p => `${p.nazwa} — ${p.cenaBrutto} zł`).join(', ')
            });
        } catch (mailErr) {
            console.error(`[ORDER] Notification email failed (order OK): ${mailErr.message}`);
        }

        logIntent({
            nip: cleanNip, scenario, resultStatus: 'order-submitted',
            email, company, comments,
            orderNumber: orderResult.orderNumber, orderId: String(orderResult.orderId),
            totalBrutto, products: pricedProducts, req
        });
        res.json({
            success: true,
            orderCreated: true,
            orderNumber: orderResult.orderNumber,
            totalBrutto,
            message: `Zamówienie ${orderResult.orderNumber} zostało utworzone. Kwota: ${totalBrutto.toFixed(2)} zł brutto. Szczegóły wyślemy na ${email}.`
        });

    } catch (err) {
        console.error(`[ORDER] Error: ${err.message}`);
        try {
            await sendNotificationEmail({
                nip: req.body.nip, company: req.body.company,
                email: req.body.email, scenario: req.body.scenario,
                comments: req.body.comments, error: err.message
            });
        } catch (mailErr) {
            console.error(`[ORDER] Notification email also failed: ${mailErr.message}`);
        }
        logIntent({ nip: req.body.nip, scenario: req.body.scenario, resultStatus: 'order-submitted', email: req.body.email, company: req.body.company, comments: req.body.comments, error: err.message, req });
        res.status(500).json({
            error: 'Nie udało się automatycznie utworzyć zamówienia. Twoje zgłoszenie zostało przekazane do zespołu.',
            fallback: true
        });
    }
});

// Helper: send notification email to pomoc@sokaris.pl
async function sendNotificationEmail({ nip, company, email, phone, scenario, comments, orderNumber, orderId, totalBrutto, products, error, note }) {
    const subject = orderNumber
        ? `[KSeF Zamówienie ${orderNumber}] NIP: ${nip}`
        : `[KSeF Narzędzie NIP] NIP: ${nip}`;

    const lines = [
        `Zapytanie z narzędzia NIP (Scenariusz ${scenario})`,
        '',
        `NIP: ${nip}`,
        `Firma: ${company || '-'}`,
        `E-mail: ${email}`,
    ];
    if (phone) lines.push(`Telefon: ${phone}`);

    if (orderNumber) {
        lines.push('', '--- ZAMÓWIENIE SAPIO ---');
        lines.push(`Numer: ${orderNumber}`);
        lines.push(`ID: ${orderId}`);
        lines.push(`Kwota brutto: ${totalBrutto?.toFixed(2)} zł`);
        if (products) lines.push(`Produkty: ${products}`);
    }
    if (note) lines.push('', `Uwaga: ${note}`);
    if (error) lines.push('', `Błąd automatyki: ${error}`);
    if (comments) lines.push('', `Uwagi klienta: ${comments}`);
    lines.push('', 'Źródło: ksef.faktura-nt.pl');
    lines.push(`Data: ${new Date().toLocaleString('pl-PL')}`);

    await transporter.sendMail({
        from: '"Narzędzie KSeF" <bok@sokaris.pl>',
        to: 'pomoc@sokaris.pl',
        subject,
        text: lines.join('\n')
    });
}

// ══════════════════════════════════════════════════════════════
// Infolinia — real data from Play VPBX API
// Returns minutes of calls per hour (today, 9-15)
// ══════════════════════════════════════════════════════════════

const PLAY_CONFIG = {
    clientId: process.env.PLAY_CLIENT_ID,
    clientSecret: process.env.PLAY_CLIENT_SECRET,
    phoneNumber: process.env.PLAY_PHONE_NUMBER,
    apiBase: process.env.PLAY_API_BASE || 'https://uslugidlafirm.play.pl',
};

let playToken = null;
let playTokenExpiresAt = 0;
let infoliniaCache = null;
let infoliniaCacheAt = 0;
const INFOLINIA_CACHE_TTL = 15 * 60 * 1000; // 15 min

async function playAuthenticate() {
    const credentials = Buffer.from(`${PLAY_CONFIG.clientId}:${PLAY_CONFIG.clientSecret}`).toString('base64');
    const response = await fetch(`${PLAY_CONFIG.apiBase}/oauth/token-jwt`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Play Auth failed: ${response.status}`);
    }
    const data = await response.json();
    playToken = data.access_token;
    playTokenExpiresAt = Date.now() + ((data.expires_in || 1200) * 1000) - 60000;
    return playToken;
}

async function playRequest(endpoint) {
    if (!playToken || Date.now() >= playTokenExpiresAt) {
        await playAuthenticate();
    }
    const response = await fetch(`${PLAY_CONFIG.apiBase}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${playToken}`,
            'Content-Type': 'application/json',
        },
    });
    if (response.status === 401) {
        await playAuthenticate();
        const retry = await fetch(`${PLAY_CONFIG.apiBase}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${playToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!retry.ok) throw new Error(`Play API: ${retry.status}`);
        return retry.json();
    }
    if (!response.ok) throw new Error(`Play API: ${response.status}`);
    return response.json();
}

function warsawToday() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

function warsawHour() {
    return parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw', hour: 'numeric', hour12: false }));
}

function warsawDayOfWeek() {
    // 0=Sun, 1=Mon, ..., 6=Sat
    return new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Warsaw', weekday: 'short' });
}

function isWorkday() {
    const day = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Warsaw', weekday: 'long' });
    return !['Saturday', 'Sunday'].includes(day);
}

app.get('/api/infolinia/today', async (req, res) => {
    // No Play credentials → return closed message
    if (!PLAY_CONFIG.clientId || !PLAY_CONFIG.clientSecret) {
        return res.json({
            status: 'closed',
            message: 'Infolinia czynna pon–pt 9:00–15:00',
            hours: [],
            total_minutes: 0,
        });
    }

    // Weekend → don't show empty hours, just info
    if (!isWorkday()) {
        return res.json({
            status: 'closed',
            message: 'Infolinia czynna pon–pt 9:00–15:00',
            hours: [],
            total_minutes: 0,
        });
    }

    const currentHour = warsawHour();

    // Before opening hours
    if (currentHour < 9) {
        return res.json({
            status: 'before_hours',
            message: 'Infolinia otwiera się o 9:00',
            hours: [],
            total_minutes: 0,
        });
    }

    // Check cache
    if (infoliniaCache && (Date.now() - infoliniaCacheAt) < INFOLINIA_CACHE_TTL) {
        return res.json(infoliniaCache);
    }

    try {
        const today = warsawToday();
        const fromDate = `${today} 07:00`;
        const toDate = `${today} 16:00`;

        const data = await playRequest(
            `/api/wirtualnacentralka/getCallHistory?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`
        );

        const calls = data.calls || [];

        // Aggregate: minutes of calls per hour (9-15 only)
        const hourMinutes = {};
        for (let h = 9; h < 15; h++) hourMinutes[h] = 0;

        for (const call of calls) {
            const ts = call.timestamp || call.startTime || call.dateTimeSetup;
            if (!ts) continue;
            const hour = parseInt(ts.split(' ')[1]?.split(':')[0]);
            if (hour >= 9 && hour < 15 && call.duration) {
                hourMinutes[hour] = (hourMinutes[hour] || 0) + Math.round(call.duration / 60);
            }
        }

        // Build response — only completed hours + current hour
        const hours = [];
        let totalMinutes = 0;
        const lastHour = Math.min(currentHour, 14); // max 14 (14:00-15:00)
        for (let h = 9; h <= lastHour; h++) {
            const mins = hourMinutes[h] || 0;
            totalMinutes += mins;
            hours.push({ hour: h, label: `${h}:00`, minutes: mins });
        }

        // After hours (15+) → show summary
        const status = currentHour >= 15 ? 'after_hours' : 'ok';

        const result = {
            status,
            date: today,
            generated_at: new Date().toISOString(),
            working_hours: 'pon–pt 9:00–15:00',
            hours,
            total_minutes: totalMinutes,
            total_display: totalMinutes >= 60
                ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`
                : `${totalMinutes}min`,
        };

        infoliniaCache = result;
        infoliniaCacheAt = Date.now();
        res.json(result);

    } catch (err) {
        console.error('[INFOLINIA] Play API error:', err.message);
        if (infoliniaCache) {
            return res.json({ ...infoliniaCache, status: 'cache', note: 'Dane z cache' });
        }
        res.json({
            status: 'error',
            message: 'Infolinia czynna pon–pt 9:00–15:00',
            hours: [],
            total_minutes: 0,
        });
    }
});

// Serve uploaded screenshots
app.use('/api/uploads', express.static(UPLOADS_DIR));

app.listen(PORT, () => {
  console.log(`[KSeF Tickets API] Running on port ${PORT}`);
});
