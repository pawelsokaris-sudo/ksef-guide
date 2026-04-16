/* ═══════════════════════════════════════
   KSeF Guide — Script
   Loads content from JSON, renders sections,
   handles code search, FAQ, navigation.
   ═══════════════════════════════════════ */

let sectionsData = [];
let codesData = [];
let faqData = [];
let articlesData = [];
let activeCodeCat = 'all';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    await loadContent();
    renderSections();
    renderCodes();
    renderFAQ();
    renderArticlesList();
    // countdown runs via setInterval in updateCountdown()
    handleHash();

    // Enter key on code search
    document.getElementById('codeInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') searchCode();
    });
});

// ── Load JSON Content ──
async function loadContent() {
    try {
        const base = getBasePath();
        const cb = '?_=' + Date.now();
        const [sections, codes, faq, articles] = await Promise.all([
            fetch(base + 'content/sections.json' + cb).then(r => r.json()),
            fetch(base + 'content/codes.json' + cb).then(r => r.json()),
            fetch(base + 'content/faq.json' + cb).then(r => r.json()),
            fetch(base + 'content/articles.json' + cb).then(r => r.json()).catch(() => [])
        ]);
        sectionsData = sections;
        codesData = codes;
        faqData = faq;
        articlesData = articles;
    } catch (err) {
        console.error('Failed to load content:', err);
    }
}

function getBasePath() {
    const path = window.location.pathname;
    if (path.endsWith('/')) return '';
    if (path.endsWith('.html')) return path.substring(0, path.lastIndexOf('/') + 1);
    return '';
}

// ── Render Sections (1 & 2) ──
function renderSections() {
    const container = document.getElementById('sectionContent');
    let html = '';

    sectionsData.forEach(section => {
        html += `<section id="section-${section.id}" class="content-section" ${section.id !== 'certyfikaty' ? 'style="display:none"' : ''}>`;
        html += `<h2>${section.icon} ${section.title}</h2>`;

        section.articles.forEach(article => {
            html += `
                <div class="article-card" id="article-${article.id}">
                    <div class="article-header" onclick="toggleArticle('${article.id}')">
                        <h3>${article.title}${article.subtitle ? `<span class="subtitle">— ${article.subtitle}</span>` : ''}</h3>
                        <span class="article-chevron">▼</span>
                    </div>
                    <div class="article-body">${article.content}</div>
                </div>`;
        });

        html += '</section>';
    });

    container.innerHTML = html;
}

// ── Render Codes Grid ──
function renderCodes(filter = '', cat = 'all') {
    const grid = document.getElementById('codesGrid');
    if (!grid) return;

    const filtered = codesData.filter(c => {
        const matchFilter = !filter ||
            c.code.includes(filter) ||
            c.title.toLowerCase().includes(filter.toLowerCase()) ||
            c.problem.toLowerCase().includes(filter.toLowerCase());
        const matchCat = cat === 'all' || c.category === cat;
        return matchFilter && matchCat;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="code-not-found">Nie znaleziono kodów pasujących do filtra.</div>';
        return;
    }

    grid.innerHTML = filtered.map(c => `
        <div class="code-result-card severity-${c.severity}" id="code-${c.code}">
            <div class="code-result-header">
                <span class="code-result-code">${c.code}</span>
                <span class="code-result-title">${c.title}</span>
            </div>
            <div class="code-result-problem">${c.problem}</div>
            <div class="code-result-solution">${c.solution}</div>
        </div>
    `).join('');
}

// ── Render FAQ ──
function renderFAQ() {
    const list = document.getElementById('faqList');
    if (!list) return;

    list.innerHTML = faqData.map((item, i) => `
        <div class="faq-item" id="faq-${i}">
            <div class="faq-question" onclick="toggleFAQ(${i})">
                <span>${item.question}</span>
                <span class="faq-toggle">+</span>
            </div>
            <div class="faq-answer">${item.answer}</div>
        </div>
    `).join('');
}

// ── Section Navigation ──
function showSection(sectionId) {
    // Update tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === sectionId);
    });

    // Map section names to IDs
    const sectionMap = {
        'certyfikaty': ['section-certyfikaty'],
        'konfiguracja': ['section-konfiguracja'],
        'kody': ['section-kody'],
        'faq': ['section-faq'],
        'artykuly': ['section-artykuly']
    };

    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(el => {
        el.style.display = 'none';
    });

    // Show selected
    const targets = sectionMap[sectionId] || [];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'block';
            el.style.animation = 'fadeIn 0.3s ease';
        }
    });

    // Scroll to top of content
    window.scrollTo({ top: document.querySelector('.section-nav').offsetTop, behavior: 'smooth' });
}

// ── Article Toggle ──
function toggleArticle(id) {
    const card = document.getElementById('article-' + id);
    if (card) card.classList.toggle('open');
}

// ── FAQ Toggle ──
function toggleFAQ(index) {
    const item = document.getElementById('faq-' + index);
    if (item) item.classList.toggle('open');
}

// ── Code Search ──
function searchCode() {
    const input = document.getElementById('codeInput').value.trim();
    const resultDiv = document.getElementById('codeResult');

    if (!input) {
        resultDiv.innerHTML = '';
        return;
    }

    // Smart NIP detection: if someone types 10+ digits, it's probably a NIP
    const digitsOnly = input.replace(/[\s\-\.]/g, '').replace(/^PL/i, '');
    if (/^\d{10,}$/.test(digitsOnly)) {
        // Auto-redirect to NIP checker
        document.getElementById('nipInput').value = input;
        document.getElementById('codeInput').value = '';
        resultDiv.innerHTML = `
            <div class="code-not-found" style="border-left: 3px solid var(--accent); padding-left: 12px;">
                To wygląda na <strong>numer NIP</strong>, nie kod problemu.<br>
                Przenoszę do sprawdzania licencji… ⏳
            </div>`;
        setTimeout(() => { resultDiv.innerHTML = ''; checkNip(); }, 800);
        return;
    }

    const code = codesData.find(c => c.code === input);

    if (code) {
        resultDiv.innerHTML = `
            <div class="code-result-card severity-${code.severity}">
                <div class="code-result-header">
                    <span class="code-result-code">${code.code}</span>
                    <span class="code-result-title">${code.title}</span>
                </div>
                <div class="code-result-problem">${code.problem}</div>
                <div class="code-result-solution">${code.solution}</div>
            </div>`;
    } else {
        resultDiv.innerHTML = `
            <div class="code-not-found">
                Kod <strong>${input}</strong> nie został znaleziony.<br>
                Sprawdź poprawność kodu lub <a href="mailto:pomoc@sokaris.pl">skontaktuj się z supportem</a>.
            </div>`;
    }
}

// ── Filter Codes ──
function filterCodes() {
    const filter = document.getElementById('codesFilter').value;
    renderCodes(filter, activeCodeCat);
}

function filterCodesCat(cat) {
    activeCodeCat = cat;
    document.querySelectorAll('.cat-pill').forEach(p => {
        p.classList.toggle('active', p.textContent.includes(cat === 'all' ? 'Wszystkie' : cat));
    });
    filterCodes();
}

// ── Live Countdown Timer ──
function updateCountdown() {
    const deadline = new Date('2026-04-01T00:00:00');
    const now = new Date();
    const diff = deadline - now;

    if (diff <= 0) {
        const banner = document.getElementById('deadlineBanner');
        if (banner) banner.innerHTML = '<div class="container"><span class="deadline-icon">✅</span> KSeF jest obowiązkowy od 1 kwietnia 2026.</div>';
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const d = document.getElementById('cdDays');
    const h = document.getElementById('cdHours');
    const m = document.getElementById('cdMins');
    const s = document.getElementById('cdSecs');
    if (d) d.textContent = days;
    if (h) h.textContent = String(hours).padStart(2, '0');
    if (m) m.textContent = String(mins).padStart(2, '0');
    if (s) s.textContent = String(secs).padStart(2, '0');
}
setInterval(updateCountdown, 1000);
updateCountdown();

// ── Deep Linking ──
function handleHash() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;

    // Code deep link (e.g. #kod-1001)
    if (hash.startsWith('kod-')) {
        const code = hash.replace('kod-', '');
        document.getElementById('codeInput').value = code;
        searchCode();
        return;
    }

    // Article deep link (e.g. #art-001)
    if (hash.startsWith('art-')) {
        showSection('artykuly');
        setTimeout(() => showArticle(hash), 100);
        return;
    }

    // Section deep link
    const sectionNames = ['certyfikaty', 'konfiguracja', 'kody', 'faq', 'artykuly'];
    if (sectionNames.includes(hash)) {
        showSection(hash);
    }
}

// ── Pills click → navigate ──
document.addEventListener('click', e => {
    if (e.target.classList.contains('pill')) {
        const text = e.target.textContent;
        if (text.includes('Certyfikaty')) showSection('certyfikaty');
        if (text.includes('Konfiguracja')) showSection('konfiguracja');
        if (text.includes('Kody')) showSection('kody');
        if (text.includes('FAQ')) showSection('faq');
        if (text.includes('Szybkie')) showSection('artykuly');
    }

    // Intercept internal #art-xxx links
    const link = e.target.closest('a[href^="#art-"]');
    if (link) {
        e.preventDefault();
        const artId = link.getAttribute('href').replace('#', '');
        showArticle(artId);
    }
});

// ── Render Articles List ──
function renderArticlesList() {
    const list = document.getElementById('articlesList');
    const view = document.getElementById('articleView');
    if (!list) return;

    if (articlesData.length === 0) {
        list.innerHTML = '<p class="section-desc">Brak artykułów.</p>';
        return;
    }

    // Registry table (hide art-001 keepsake from listing)
    const visibleArticles = articlesData.filter(a => a.id !== 'art-001');
    let html = `
        <div class="qa-registry">
            <h3>📋 Rejestr rozwiązań</h3>
            <table class="info-table qa-registry-table">
                <thead>
                    <tr><th>Nr</th><th>Problem / Tytuł</th><th>Data</th></tr>
                </thead>
                <tbody>
                    ${visibleArticles.map(art => `
                        <tr onclick="showArticle('${art.id}')" class="qa-registry-row">
                            <td><span class="qa-card-id">${art.id}</span></td>
                            <td>${art.title}</td>
                            <td>${art.date}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;

    // Cards below
    html += visibleArticles.map(art => `
        <div class="qa-card" onclick="showArticle('${art.id}')">
            <div class="qa-card-header">
                <span class="qa-card-id">${art.id}</span>
                <span class="qa-card-date">${art.date}</span>
            </div>
            <h3 class="qa-card-title">${art.title}</h3>
            <div class="qa-card-tags">${art.tags.map(t => `<span class="qa-tag">${t}</span>`).join('')}</div>
        </div>
    `).join('');

    list.innerHTML = html;
}

// ── Show Single Article ──
function showArticle(id) {
    const art = articlesData.find(a => a.id === id);
    if (!art) return;

    const list = document.getElementById('articlesList');
    const view = document.getElementById('articleView');

    list.style.display = 'none';
    view.style.display = 'block';
    view.style.animation = 'fadeIn 0.3s ease';

    let html = `
        <button class="qa-back" onclick="backToArticles()">← Wróć do listy</button>
        <div class="qa-article">
            <div class="qa-article-meta">
                <span class="qa-card-id">${art.id}</span>
                <span class="qa-card-date">${art.date}</span>
            </div>
            <h2>${art.title}</h2>
            <div class="qa-article-body">
                ${renderBlockContent(art.content)}
            </div>
            <div class="qa-share">
                <button onclick="copyArticleLink('${art.id}')" class="qa-share-btn">📋 Kopiuj link do artykułu</button>
            </div>

            <!-- CONTACT + FEEDBACK SECTION -->
            <div class="contact-feedback-section">
                <div class="contact-phone-block">
                    <h3>📞 Wolisz zadzwonić?</h3>
                    <div class="phone-number">22 38 956 38</div>
                    <div class="phone-hours">pon–pt, 9:00–15:00</div>
                    <div class="phone-chart" id="phoneChart-${art.id}">
                        <div class="phone-chart-label">Zajętość infolinii dziś:</div>
                        <div class="phone-chart-data" id="phoneChartData-${art.id}">
                            <div class="phone-chart-loading">Ładowanie danych...</div>
                        </div>
                    </div>
                </div>

                <div class="feedback-form-block">
                    <h3>✍️ Opisz problem — otrzymasz nr zgłoszenia</h3>
                    <p class="feedback-context-note">Kontekst: <strong>${art.title}</strong> (${art.id})</p>
                    <div id="feedbackForm-${art.id}">
                        <div class="feedback-row">
                            <input type="text" id="feedbackNip-${art.id}" class="feedback-input" placeholder="NIP firmy *" maxlength="13" required>
                            <input type="text" id="feedbackVersion-${art.id}" class="feedback-input" placeholder="Wersja programu (np. 5.14.0.1256)" maxlength="20">
                        </div>
                        <div class="feedback-row">
                            <input type="email" id="feedbackEmail-${art.id}" class="feedback-input" placeholder="📧 Email *" required>
                            <input type="tel" id="feedbackPhone-${art.id}" class="feedback-input" placeholder="📱 Telefon">
                        </div>
                        <textarea id="feedbackDesc-${art.id}" class="feedback-textarea" placeholder="Opisz problem — co próbujesz zrobić i co się dzieje? *" rows="4" required></textarea>
                        <div class="feedback-upload-row">
                            <label class="feedback-upload-label" for="feedbackFile-${art.id}">
                                📎 Załącz zrzut ekranu (opcjonalnie, max 5 MB)
                            </label>
                            <input type="file" id="feedbackFile-${art.id}" class="feedback-file-input" accept="image/*">
                            <span id="feedbackFileName-${art.id}" class="feedback-file-name"></span>
                        </div>
                        <button class="feedback-submit" onclick="submitFeedback('${art.id}')">Wyślij zgłoszenie</button>
                        <p class="feedback-required-note">* Pola wymagane</p>
                    </div>
                    <div id="feedbackResult-${art.id}" class="feedback-result" style="display:none"></div>
                </div>
            </div>
        </div>`;

    view.innerHTML = html;
    highlightCurrentHour();
    window.location.hash = art.id;
}

// ── Back to Articles List ──
function backToArticles() {
    const list = document.getElementById('articlesList');
    const view = document.getElementById('articleView');
    list.style.display = 'block';
    view.style.display = 'none';
    window.location.hash = 'artykuly';
}

// ── Block Content Renderer ──
function renderBlockContent(blocks) {
    return blocks.map(block => {
        switch (block.type) {
            case 'text':
                return `<p>${block.value}</p>`;
            case 'heading':
                return `<h4>${block.value}</h4>`;
            case 'alert':
                return `<div class="alert alert-${block.severity}">${block.value}</div>`;
            case 'image':
                return `<div class="article-image">
                    <img src="${block.src}" alt="${block.alt || ''}" loading="lazy">
                    ${block.caption ? `<p class="img-caption">${block.caption}</p>` : ''}
                </div>`;
            case 'youtube':
                return `<div class="qa-youtube">
                    <iframe src="https://www.youtube.com/embed/${block.videoId}"
                        title="${block.title || ''}" frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>
                    ${block.title ? `<p class="img-caption">${block.title}</p>` : ''}
                </div>`;
            case 'code':
                return `<pre class="qa-code"><code>${block.value}</code></pre>`;
            case 'copybox': {
                const cbId = 'copybox-' + Math.random().toString(36).substr(2, 8);
                return `<div class="copybox">
                    <div class="copybox-header">
                        <span class="copybox-label">${block.label || '📋 Kod do skopiowania'}</span>
                        <button class="copybox-btn" onclick="copyBoxContent('${cbId}')">📋 Kopiuj</button>
                    </div>
                    <textarea id="${cbId}" class="copybox-textarea" readonly rows="${block.rows || 4}">${block.value}</textarea>
                </div>`;
            }
            case 'list':
                return `<ul>${block.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
            case 'table':
                return `<table class="info-table">
                    <thead><tr>${block.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                    <tbody>${block.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>`;
            case 'divider':
                return `<hr class="qa-divider">`;
            case 'stepper':
                return `<div class="stepper">
                    <div class="stepper-info">${block.info}</div>
                    <div class="stepper-steps">
                        ${block.steps.map((s, i) => `${i > 0 ? '<span class="step-arrow">\u2192</span>' : ''}<span class="step-item">${s}</span>`).join('')}
                    </div>
                </div>`;
            case 'symptom-nav':
                return `<div class="symptom-navigator">
                    <div class="symptom-info">\ud83d\udd0d Znajd\u017a sw\u00f3j problem:</div>
                    <div class="symptom-list">
                        ${block.items.map(s => `<span class="symptom symptom-${s.color || 'red'}">${s.label}</span>`).join('')}
                    </div>
                </div>`;
            default:
                return `<p>${block.value || ''}</p>`;
        }
    }).join('');
}

// ── Copy Article Link ──
function copyArticleLink(id) {
    const url = window.location.origin + window.location.pathname + '#' + id;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.qa-share-btn');
        if (btn) {
            btn.textContent = '✅ Skopiowano!';
            setTimeout(() => btn.textContent = '📋 Kopiuj link do artykułu', 2000);
        }
    });
}

// ── Phone Chart: fetch real data from Play VPBX ──
async function loadInfoliniaData(articleId) {
    const container = document.getElementById(`phoneChartData-${articleId}`);
    if (!container) return;

    try {
        const resp = await fetch('/api/infolinia/today');
        const data = await resp.json();

        // Closed / weekend / before hours / error → show message
        if (!data.hours || data.hours.length === 0 || data.status === 'closed' || data.status === 'before_hours' || data.status === 'error' || data.status === 'unavailable') {
            container.innerHTML = `<div class="phone-chart-info">${data.message || 'Infolinia czynna pon–pt 9:00–15:00'}</div>`;
            return;
        }

        // Determine occupancy level from minutes
        function getLevel(mins) {
            if (mins >= 40) return { level: 'red', icon: '🔴', label: 'zajęte' };
            if (mins >= 15) return { level: 'yellow', icon: '🟡', label: 'umiarkowane' };
            return { level: 'green', icon: '🟢', label: 'wolne' };
        }

        // Max minutes for bar scaling (at least 60 to avoid tiny bars)
        const maxMins = Math.max(60, ...data.hours.map(h => h.minutes));
        const currentHour = new Date().getHours();

        // Render visual bars
        let html = '<div class="phone-chart-bars">';
        for (const h of data.hours) {
            const pct = Math.max(5, Math.round((h.minutes / maxMins) * 100));
            const { level, icon } = getLevel(h.minutes);
            const isCurrent = h.hour === currentHour;
            html += `<div class="phone-bar${isCurrent ? ' current-hour' : ''}" data-level="${level}" style="--bar-height:${pct}%" title="${h.minutes} min rozmów">
                <span>${h.hour}</span>
            </div>`;
        }
        html += '</div>';

        // Legend
        html += `<div class="phone-chart-legend">
            <span class="legend-item legend-green">🟢 wolne</span>
            <span class="legend-item legend-yellow">🟡 umiarkowane</span>
            <span class="legend-item legend-red">🔴 zajęte</span>
        </div>`;

        if (data.status === 'after_hours') {
            html += '<div class="phone-chart-info" style="font-size:0.85em;margin-top:6px">Podsumowanie dnia</div>';
        }
        if (data.status === 'cache') {
            html += '<div class="phone-chart-info" style="font-size:0.8em;opacity:0.7">Dane z cache</div>';
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="phone-chart-info">Infolinia czynna pon–pt 9:00–15:00</div>';
    }
}

// Legacy alias
function highlightCurrentHour() {
    // Find article ID from any phoneChart container
    const charts = document.querySelectorAll('[id^="phoneChartData-"]');
    charts.forEach(el => {
        const artId = el.id.replace('phoneChartData-', '');
        loadInfoliniaData(artId);
    });
}

// ── Submit Feedback / Ticket ──
async function submitFeedback(articleId) {
    const nip = document.getElementById(`feedbackNip-${articleId}`);
    const email = document.getElementById(`feedbackEmail-${articleId}`);
    const phone = document.getElementById(`feedbackPhone-${articleId}`);
    const version = document.getElementById(`feedbackVersion-${articleId}`);
    const desc = document.getElementById(`feedbackDesc-${articleId}`);
    const fileInput = document.getElementById(`feedbackFile-${articleId}`);
    const form = document.getElementById(`feedbackForm-${articleId}`);
    const result = document.getElementById(`feedbackResult-${articleId}`);

    // Validate required fields
    let valid = true;
    [nip, email, desc].forEach(el => { el.style.borderColor = ''; });

    if (!nip.value.trim() || nip.value.trim().length < 10) {
        nip.style.borderColor = '#ef4444';
        valid = false;
    }
    if (!email.value.trim() || !email.value.includes('@')) {
        email.style.borderColor = '#ef4444';
        valid = false;
    }
    if (!desc.value.trim() || desc.value.trim().length < 5) {
        desc.style.borderColor = '#ef4444';
        valid = false;
    }
    if (!valid) return;

    const btn = form.querySelector('.feedback-submit');
    btn.disabled = true;
    btn.textContent = '⏳ Wysyłam...';

    try {
        const formData = new FormData();
        formData.append('article_id', articleId);
        formData.append('nip', nip.value.trim());
        formData.append('email', email.value.trim());
        formData.append('phone', phone.value.trim());
        formData.append('program_version', version.value.trim());
        formData.append('description', desc.value.trim());
        if (fileInput.files[0]) {
            formData.append('screenshot', fileInput.files[0]);
        }

        const res = await fetch('/api/ticket', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (res.ok) {
            form.style.display = 'none';
            result.style.display = 'block';
            result.innerHTML = `
                <div class="feedback-success">
                    <div class="feedback-check">✅</div>
                    <div class="feedback-ticket-id">${data.ticketId}</div>
                    <p>Dziękujemy za zgłoszenie!</p>
                    <p>Twój numer: <strong>${data.ticketId}</strong></p>
                    <p>Odezwiemy się na <strong>${email.value.trim()}</strong></p>
                </div>`;
        } else {
            btn.disabled = false;
            btn.textContent = 'Wyślij zgłoszenie';
            alert(data.error || 'Wystąpił błąd. Spróbuj ponownie.');
        }
    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Wyślij zgłoszenie';
        alert('Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.');
    }
}

// ── NIP CHECKER LOGIC ──
async function checkNip() {
    const raw = document.getElementById('nipInput').value;
    const nip = raw.replace(/^PL/i, '').replace(/[\s\-\.]/g, ''); // strip PL prefix, spaces, dashes, dots
    document.getElementById('nipInput').value = nip; // show cleaned value
    const resultDiv = document.getElementById('nipResult');
    const btn = document.getElementById('nipBtn');
    
    if (!nip || !/^\d{10}$/.test(nip)) {
        alert('Proszę podać prawidłowy 10-cyfrowy NIP.\nMożesz wpisać z kreskami (np. 655-165-99-56) lub bez.');
        return;
    }
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="nip-result-loader">⏳ Sprawdzam bazę licencji... To może zająć do 5 sekund.</div>';
    btn.disabled = true;
    btn.textContent = 'Sprawdzam...';
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch('/api/check-nip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Błąd serwera');
        }
        
        renderNipScenario(data);
    } catch (err) {
        console.error('NIP Check error:', err);
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
            resultDiv.innerHTML = '<div class="alert alert-danger">⚠️ Przepraszamy, system chwilowo niedostępny. Spróbuj ponownie za chwilę lub napisz na pomoc@sokaris.pl</div>';
        } else {
            resultDiv.innerHTML = '<div class="alert alert-danger">⚠️ ' + err.message + '</div>';
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sprawdź NIP';
    }
}

function renderNipScenario(data) {
    const r = document.getElementById('nipResult');
    let html = '';

    // Privacy-safe order form — no pre-filled email from DB
    const orderFormHTML = (actionBtnText) => `
        <div class="scenario-order-form" id="orderFormBox">
            <div class="scenario-form-row">
                <input type="text" id="orderCompany" placeholder="Nazwa firmy *" required>
            </div>
            <div class="scenario-form-row">
                <input type="email" id="orderEmail" placeholder="Adres e-mail *" required>
            </div>
            <div class="scenario-form-row" id="phoneRow" style="display:none">
                <input type="tel" id="orderPhone" placeholder="Numer telefonu *">
            </div>
            <div class="scenario-form-row">
                <input type="text" id="orderComments" placeholder="Dodatkowe uwagi (opcjonalnie)">
            </div>
            <button onclick="submitOrder('${data.nip}', '${data.scenario}')" id="orderBtn">${actionBtnText}</button>
            <p style="font-size: 11px; margin-top: 8px; color: var(--text-dim); text-align: center;">Zamówienie trafi do naszego zespołu. Skontaktujemy się z Tobą.</p>
        </div>
        <div id="orderSuccess" style="display:none; margin-top:15px; text-align:center;" class="alert alert-success"></div>
    `;

    switch(data.scenario) {
        case 'A':
            html = `
            <div class="scenario-box">
                <h3>Jak mozemy Ci pomoc?</h3>
                <p>Zostaw swoje dane — przygotujemy oferte programu Faktura-NT z modulem KSeF.</p>
                ${orderFormHTML('Wyslij zapytanie')}
            </div>`;
            break;

        case 'B':
            html = `
            <div class="scenario-box">
                <h3>Przejdz na Faktura-NT</h3>
                <p>Przygotujemy dla Ciebie pakiet migracyjny z modulem KSeF Smart.</p>
                ${orderFormHTML('Wyslij zamowienie')}
            </div>`;
            break;

        case 'C':
            html = `
            <div class="scenario-box">
                <h3>Instrukcje konfiguracji KSeF</h3>
                <p>Przejdz do sekcji konfiguracji ponizej, aby skonfigurowac polaczenie z KSeF w swoim programie.</p>
                <button class="qa-back" onclick="showSection('konfiguracja')">KONFIGURACJA KSeF ↓</button>
            </div>`;
            break;

        case 'D':
            html = `
            <div class="scenario-box">
                <h3>Zamow modul KSeF Smart</h3>
                <p>Rozszerz swoja licencje o modul lacznosci z Krajowym Systemem e-Faktur.</p>
                ${orderFormHTML('Zamow KSeF Smart')}
            </div>`;
            break;

        case 'E':
            html = `
            <div class="scenario-box">
                <h3>Odnow licencje</h3>
                <p>Odnow dostep do aktualizacji i dodaj modul KSeF Smart.</p>
                ${orderFormHTML('Zapytaj o wycene')}
            </div>`;
            break;

        case 'F':
            html = `
            <div class="scenario-box">
                <h3>Zamow modul KSeF Smart</h3>
                <p>Dodaj modul lacznosci KSeF do swojej aplikacji.</p>
                ${orderFormHTML('Zamow KSeF Smart')}
            </div>`;
            break;

        case 'G':
            html = `
            <div class="scenario-box">
                <h3>Zamow modul KSeF Smart</h3>
                <p>Rozszerz system o modul lacznosci z KSeF.</p>
                ${orderFormHTML('Zamow KSeF Smart')}
            </div>`;
            break;

        case 'H':
            html = `
            <div class="scenario-box">
                <h3>Jak mozemy Ci pomoc?</h3>
                <p>Zostaw swoje dane — nasz zespol zweryfikuje Twoj status i odezwie sie.</p>
                <p style="font-size: 13px; color: var(--text-muted);">Mozesz tez zadzwonic: <strong style="color: var(--text);">22 38 956 38</strong> lub napisac na <a href="mailto:pomoc@sokaris.pl">pomoc@sokaris.pl</a></p>
                ${orderFormHTML('Wyslij prosbe o kontakt')}
            </div>`;
            break;

        default:
            html = `<div class="alert alert-info">Skontaktuj sie z nami: pomoc@sokaris.pl</div>`;
    }

    r.innerHTML = html;
}

async function submitOrder(nip, scenario) {
    const compBox = document.getElementById('orderCompany');
    const mailBox = document.getElementById('orderEmail');
    const phoneBox = document.getElementById('orderPhone');
    const cmtBox  = document.getElementById('orderComments');
    const btn = document.getElementById('orderBtn');
    const successDiv = document.getElementById('orderSuccess');
    const phoneRow = document.getElementById('phoneRow');

    const company = compBox ? compBox.value.trim() : '';
    const email = mailBox ? mailBox.value.trim() : '';
    const phone = phoneBox ? phoneBox.value.trim() : '';
    const comments = cmtBox ? cmtBox.value.trim() : '';

    if (!email || !email.includes('@')) {
        alert('Podaj poprawny adres e-mail');
        return;
    }

    if (phoneRow && phoneRow.style.display !== 'none' && !phone) {
        alert('Podaj numer telefonu');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Trwa przetwarzanie...';

    try {
        const res = await fetch('/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip, company, email, phone: phone || undefined, comments, scenario })
        });

        const data = await res.json();

        // Phone fallback: server says email doesn't match, ask for phone
        if (data.needsPhone) {
            if (phoneRow) {
                phoneRow.style.display = 'block';
                if (phoneBox) phoneBox.focus();
            }
            btn.disabled = false;
            btn.textContent = 'Wyslij z telefonem';
            return;
        }

        if (data.success) {
            const formBox = document.getElementById('orderFormBox');
            if (formBox) formBox.style.display = 'none';

            if (data.orderCreated && data.orderNumber) {
                successDiv.innerHTML = `
                    <h4>Zamowienie przyjete!</h4>
                    <p><strong>Numer: ${data.orderNumber}</strong></p>
                    <p>${data.message}</p>
                `;
            } else {
                successDiv.innerHTML = `
                    <h4>Zgloszenie przyjete</h4>
                    <p>${data.message}</p>
                `;
            }
            successDiv.style.display = 'block';
        } else {
            throw new Error(data.error || 'Wystapil blad');
        }
    } catch (err) {
        console.error('Order error:', err);
        if (successDiv) {
            successDiv.className = 'alert alert-warning';
            successDiv.innerHTML = `
                <p>Nie udalo sie przetworzyc zamowienia.</p>
                <p>Twoje zgloszenie zostalo przekazane do zespolu. Skontaktujemy sie wkrotce.</p>
            `;
            successDiv.style.display = 'block';
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Zamow';
    }
}

// Expose to global scope for inline onclick handlers
window.checkNip = checkNip;
window.submitOrder = submitOrder;

// ── Copy Box Content ──
function copyBoxContent(id) {
    const textarea = document.getElementById(id);
    if (!textarea) return;
    // Decode HTML entities to get raw text
    const tmp = document.createElement('textarea');
    tmp.innerHTML = textarea.value;
    const rawText = tmp.value;
    navigator.clipboard.writeText(rawText).then(() => {
        const btn = textarea.parentElement.querySelector('.copybox-btn');
        if (btn) {
            btn.textContent = '✅ Skopiowano!';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = '📋 Kopiuj'; btn.classList.remove('copied'); }, 2500);
        }
    });
}
window.copyBoxContent = copyBoxContent;
