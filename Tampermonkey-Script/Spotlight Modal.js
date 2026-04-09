// ==UserScript==
// @name         Spotlight Modal
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  Spotlight-style modal for unified request search in Plex
// @author       JJJ
// @match        *://localhost:32302/web/*
// @match        *://127.0.0.1:32302/web/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=undefined.localhost
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════
    const CONFIG = {
        API_BASE: 'http://localhost:8095',
        TMDB_IMG_PLACEHOLDER: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        SEARCH_DEBOUNCE_MS: 280,
        POLL_INTERVAL_MS: 1500,
        POLL_ERROR_INTERVAL_MS: 2000,
        STATUS_RESET_DELAY_MS: 5000,
        MAX_RESULTS: 8,
        MAX_POLL_ERRORS: 5,
    };

    const LANGUAGES = [
        { code: 'en', label: 'English', flag: '🇬🇧' },
        { code: 'es', label: 'Spanish', flag: '🇪🇸' },
        { code: 'it', label: 'Italian', flag: '🇮🇹' },
        { code: 'fr', label: 'French', flag: '🇫🇷' },
        { code: 'de', label: 'German', flag: '🇩🇪' },
        { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
        { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
        { code: 'ko', label: 'Korean', flag: '🇰🇷' },
        { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
        { code: 'ru', label: 'Russian', flag: '🇷🇺' },
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // THEME / STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const THEME = {
        colors: {
            bg: {
                overlay: 'rgba(0, 0, 0, 0.75)',
                modal: 'rgba(15, 23, 42, 0.98)',
                input: 'rgba(30, 41, 59, 0.8)',
                hover: 'rgba(59, 130, 246, 0.12)',
                card: 'rgba(30, 41, 59, 0.6)',
            },
            border: {
                default: 'rgba(71, 85, 105, 0.4)',
                focus: 'rgba(59, 130, 246, 0.6)',
                light: 'rgba(255, 255, 255, 0.08)',
            },
            text: {
                primary: 'rgba(248, 250, 252, 1)',
                secondary: 'rgba(148, 163, 184, 1)',
                muted: 'rgba(100, 116, 139, 1)',
            },
            accent: {
                blue: 'rgba(59, 130, 246, 1)',
                blueBg: 'rgba(59, 130, 246, 0.15)',
                purple: 'rgba(168, 85, 247, 1)',
                purpleBg: 'rgba(168, 85, 247, 0.15)',
                green: 'rgba(34, 197, 94, 1)',
                greenBg: 'rgba(34, 197, 94, 0.15)',
                red: 'rgba(239, 68, 68, 1)',
                redBg: 'rgba(239, 68, 68, 0.15)',
                yellow: 'rgba(234, 179, 8, 1)',
                yellowBg: 'rgba(234, 179, 8, 0.15)',
            },
        },
        radius: {
            sm: '8px',
            md: '12px',
            lg: '16px',
            full: '9999px',
        },
        shadow: {
            sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
            md: '0 4px 12px rgba(0, 0, 0, 0.4)',
            lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
        },
        transition: {
            fast: 'all 0.15s ease',
            normal: 'all 0.2s ease',
            slow: 'all 0.3s ease',
        },
    };

    const STATUS_PALETTE = {
        idle: {
            bg: THEME.colors.bg.card,
            border: THEME.colors.border.default,
            color: THEME.colors.text.secondary,
            icon: '○',
        },
        running: {
            bg: THEME.colors.accent.blueBg,
            border: THEME.colors.accent.blue,
            color: THEME.colors.accent.blue,
            icon: '◐',
        },
        success: {
            bg: THEME.colors.accent.greenBg,
            border: THEME.colors.accent.green,
            color: THEME.colors.accent.green,
            icon: '✓',
        },
        error: {
            bg: THEME.colors.accent.redBg,
            border: THEME.colors.accent.red,
            color: THEME.colors.accent.red,
            icon: '✕',
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // INJECT GLOBAL STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const STYLES = `
        @keyframes gs-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        @keyframes gs-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        @keyframes gs-fadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
        }
        @keyframes gs-slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .gs-animate-fadeIn {
            animation: gs-fadeIn 0.2s ease forwards;
        }
        .gs-animate-slideUp {
            animation: gs-slideUp 0.2s ease forwards;
        }
        .gs-animate-spin {
            animation: gs-spin 1s linear infinite;
        }
        .gs-animate-pulse {
            animation: gs-pulse 1.5s ease-in-out infinite;
        }
        .gs-scrollbar::-webkit-scrollbar {
            width: 6px;
        }
        .gs-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .gs-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(100, 116, 139, 0.4);
            border-radius: 3px;
        }
        .gs-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.6);
        }
        .gs-checkbox {
            appearance: none;
            width: 18px;
            height: 18px;
            border: 2px solid ${THEME.colors.border.default};
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            position: relative;
            transition: ${THEME.transition.fast};
            flex-shrink: 0;
        }
        .gs-checkbox:checked {
            background: ${THEME.colors.accent.blue};
            border-color: ${THEME.colors.accent.blue};
        }
        .gs-checkbox:checked::after {
            content: '✓';
            position: absolute;
            color: white;
            font-size: 12px;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        .gs-checkbox:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .gs-radio {
            appearance: none;
            width: 16px;
            height: 16px;
            border: 2px solid ${THEME.colors.border.default};
            border-radius: 50%;
            background: transparent;
            cursor: pointer;
            position: relative;
            transition: ${THEME.transition.fast};
            flex-shrink: 0;
        }
        .gs-radio:checked {
            border-color: ${THEME.colors.accent.blue};
        }
        .gs-radio:checked::after {
            content: '';
            position: absolute;
            width: 8px;
            height: 8px;
            background: ${THEME.colors.accent.blue};
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        .gs-input {
            width: 100%;
            height: 44px;
            padding: 0 16px;
            border-radius: ${THEME.radius.md};
            border: 1px solid ${THEME.colors.border.default};
            background: ${THEME.colors.bg.input};
            color: ${THEME.colors.text.primary};
            font-size: 14px;
            outline: none;
            transition: ${THEME.transition.fast};
        }
        .gs-input:focus {
            border-color: ${THEME.colors.border.focus};
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .gs-input::placeholder {
            color: ${THEME.colors.text.muted};
        }
        .gs-input-sm {
            height: 36px;
            padding: 0 12px;
            font-size: 13px;
        }
        .gs-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: ${THEME.radius.md};
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: ${THEME.transition.fast};
            border: none;
            outline: none;
        }
        .gs-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .gs-btn-primary {
            background: ${THEME.colors.accent.blue};
            color: white;
        }
        .gs-btn-primary:hover:not(:disabled) {
            background: rgba(37, 99, 235, 1);
            transform: translateY(-1px);
        }
        .gs-btn-success {
            background: ${THEME.colors.accent.green};
            color: white;
        }
        .gs-btn-success:hover:not(:disabled) {
            background: rgba(22, 163, 74, 1);
            transform: translateY(-1px);
        }
        .gs-btn-ghost {
            background: transparent;
            color: ${THEME.colors.text.secondary};
            border: 1px solid ${THEME.colors.border.default};
        }
        .gs-btn-ghost:hover:not(:disabled) {
            background: ${THEME.colors.bg.hover};
            border-color: ${THEME.colors.border.focus};
        }
        .gs-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: ${THEME.radius.full};
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .gs-badge-movie {
            background: ${THEME.colors.accent.blueBg};
            color: ${THEME.colors.accent.blue};
            border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .gs-badge-tv {
            background: ${THEME.colors.accent.purpleBg};
            color: ${THEME.colors.accent.purple};
            border: 1px solid rgba(168, 85, 247, 0.3);
        }
        .gs-result-item {
            all: unset;
            display: flex;
            gap: 12px;
            align-items: center;
            padding: 12px 14px;
            cursor: pointer;
            transition: ${THEME.transition.fast};
            border-bottom: 1px solid ${THEME.colors.border.light};
        }
        .gs-result-item:last-child {
            border-bottom: none;
        }
        .gs-result-item:hover,
        .gs-result-item.highlighted {
            background: ${THEME.colors.bg.hover};
        }
        .gs-result-item.highlighted {
            background: rgba(59, 130, 246, 0.18);
        }
        .gs-poster {
            width: 40px;
            height: 60px;
            object-fit: cover;
            border-radius: ${THEME.radius.sm};
            background: ${THEME.colors.bg.card};
            flex-shrink: 0;
        }
        .gs-poster-placeholder {
            width: 40px;
            height: 60px;
            border-radius: ${THEME.radius.sm};
            background: ${THEME.colors.bg.card};
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${THEME.colors.text.muted};
            font-size: 16px;
            flex-shrink: 0;
        }
        .gs-card {
            background: ${THEME.colors.bg.card};
            border: 1px solid ${THEME.colors.border.light};
            border-radius: ${THEME.radius.md};
            padding: 12px;
        }
        .gs-section-title {
            font-size: 11px;
            font-weight: 600;
            color: ${THEME.colors.text.muted};
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .gs-tooltip {
            position: relative;
        }
        .gs-tooltip::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            padding: 6px 10px;
            background: ${THEME.colors.bg.modal};
            border: 1px solid ${THEME.colors.border.default};
            border-radius: ${THEME.radius.sm};
            font-size: 11px;
            color: ${THEME.colors.text.secondary};
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s;
            z-index: 10;
        }
        .gs-tooltip:hover::after {
            opacity: 1;
        }
    `;

    // Inject styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = STYLES;
    document.head.appendChild(styleSheet);

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════
    const state = {
        highlightedIndex: -1,
        searchResults: [],
        selected: null,
        confirmCandidates: [],
        requestId: null,
        searchTimer: null,
        requestProcessTimer: null,
        requestStatusPollTimer: null,
        currentMode: 'both',
        lastPreferences: null,
        isLoading: false,
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════
    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'style' && typeof v === 'object') {
                Object.assign(node.style, v);
            } else if (k === 'class' || k === 'className') {
                node.className = v;
            } else if (k.startsWith('on') && typeof v === 'function') {
                node.addEventListener(k.slice(2).toLowerCase(), v);
            } else if (v !== null && v !== undefined) {
                node.setAttribute(k, String(v));
            }
        });
        children.forEach(c => {
            if (c instanceof Node) {
                node.appendChild(c);
            } else if (c !== null && c !== undefined) {
                node.appendChild(document.createTextNode(String(c)));
            }
        });
        return node;
    }

    function escapeHtml(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function uniqStrings(xs) {
        const out = [];
        const seen = new Set();
        (xs || []).forEach(v => {
            const s = String(v || '').trim();
            if (s && !seen.has(s)) {
                seen.add(s);
                out.push(s);
            }
        });
        return out;
    }

    function parseCommaList(raw) {
        if (!raw) return [];
        return uniqStrings(String(raw).split(',').map(x => x.trim()).filter(Boolean));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    async function apiGet(path) {
        const res = await fetch(`${CONFIG.API_BASE}${path}`, { credentials: 'omit' });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`GET ${path} failed (${res.status}) ${txt}`);
        }
        return res.json();
    }

    async function apiPost(path, body) {
        const res = await fetch(`${CONFIG.API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            credentials: 'omit',
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    async function apiPut(path, body) {
        const res = await fetch(`${CONFIG.API_BASE}${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            credentials: 'omit',
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATUS BADGE
    // ═══════════════════════════════════════════════════════════════════════════
    function setRequestProcess(statusKey, text) {
        const badges = document.querySelectorAll('.gs-status-badge');
        if (!badges.length) return;

        if (state.requestProcessTimer) {
            clearTimeout(state.requestProcessTimer);
            state.requestProcessTimer = null;
        }

        const palette = STATUS_PALETTE[statusKey] || STATUS_PALETTE.idle;
        const displayText = text || (statusKey === 'idle' ? 'Ready' : '');
        const isRunning = statusKey === 'running';

        badges.forEach(badge => {
            const icon = badge.querySelector('.gs-status-icon');
            const label = badge.querySelector('.gs-status-label');

            badge.style.background = palette.bg;
            badge.style.borderColor = palette.border;
            badge.style.color = palette.color;

            if (icon) {
                icon.textContent = palette.icon;
                icon.className = `gs-status-icon ${isRunning ? 'gs-animate-spin' : ''}`;
            }
            if (label) {
                label.textContent = displayText;
            }
        });

        if (statusKey === 'success' || statusKey === 'error') {
            state.requestProcessTimer = setTimeout(() => {
                setRequestProcess('idle', 'Ready');
            }, CONFIG.STATUS_RESET_DELAY_MS);
        }
    }

    function stopRequestStatusPolling() {
        if (state.requestStatusPollTimer) {
            clearTimeout(state.requestStatusPollTimer);
            state.requestStatusPollTimer = null;
        }
    }

    function setIdleIfNoActiveRequest() {
        if (state.requestId) return;
        if (!state.requestStatusPollTimer) setRequestProcess('idle', 'Ready');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODAL CONTROLS
    // ═══════════════════════════════════════════════════════════════════════════
    function findPlexSearchAnchor() {
        const input = document.querySelector('#quickSearchInput');
        if (!input) return null;
        const combobox = input.closest('[role="combobox"]');
        return combobox || input.parentElement;
    }

    function openSpotlight() {
        const overlay = document.getElementById('gs-overlay');
        if (!overlay) return;

        overlay.style.display = 'flex';
        setIdleIfNoActiveRequest();

        const input = document.getElementById('gs-search-input');
        if (input) {
            input.focus();
            input.select();
        }

        state.highlightedIndex = -1;
        state.searchResults = [];
        state.selected = null;
        state.confirmCandidates = [];

        if (state.requestId && !state.requestStatusPollTimer) {
            pollRequestStatus(state.requestId);
        }

        showPanel('search');
        loadPreferencesIntoModal();
    }

    function closeSpotlight() {
        const overlay = document.getElementById('gs-overlay');
        if (!overlay) return;

        overlay.style.display = 'none';

        const input = document.getElementById('gs-search-input');
        if (input) input.value = '';

        const resultsBox = document.getElementById('gs-results');
        if (resultsBox) {
            resultsBox.innerHTML = '';
            resultsBox.style.display = 'none';
        }

        ['gs-options', 'gs-confirm', 'gs-progress'].forEach(id => {
            const box = document.getElementById(id);
            if (box) box.style.display = 'none';
        });

        state.highlightedIndex = -1;
        state.searchResults = [];
        state.selected = null;
        state.confirmCandidates = [];

        setIdleIfNoActiveRequest();
    }

    function showPanel(which) {
        const panels = {
            search: document.getElementById('gs-results'),
            options: document.getElementById('gs-options'),
            confirm: document.getElementById('gs-confirm'),
            progress: document.getElementById('gs-progress'),
        };

        Object.entries(panels).forEach(([key, panel]) => {
            if (!panel) return;
            if (key === 'search') {
                // Results box handled separately
            } else {
                panel.style.display = key === which ? 'flex' : 'none';
            }
        });

        if (which !== 'search') {
            const resultsBox = panels.search;
            if (resultsBox) resultsBox.style.display = 'none';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODE HANDLING
    // ═══════════════════════════════════════════════════════════════════════════
    function getModeFromUI() {
        const r = document.querySelector('input[name="gs-mode"]:checked');
        const v = r ? String(r.value || '').trim() : 'both';
        return ['movie', 'tv', 'both'].includes(v) ? v : 'both';
    }

    function setModeInUI(mode) {
        const m = ['movie', 'tv', 'both'].includes(mode) ? mode : 'both';
        const r = document.querySelector(`input[name="gs-mode"][value="${m}"]`);
        if (r) r.checked = true;
        state.currentMode = m;
    }

    function allowedByMode(itemType) {
        const t = String(itemType || '').toLowerCase();
        if (state.currentMode === 'movie') return t === 'movie';
        if (state.currentMode === 'tv') return t === 'tv';
        return t === 'movie' || t === 'tv';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PREFERENCES
    // ═══════════════════════════════════════════════════════════════════════════
    function getDefaultPairFromUI(inputId1, inputId2) {
        const a = String((document.getElementById(inputId1) || {}).value || '').trim();
        const b = String((document.getElementById(inputId2) || {}).value || '').trim();
        if (!a && b) return [b, ''];
        return [a, b];
    }

    function applyDefaultsFirst(list, default1, default2) {
        const xs = uniqStrings(list || []);
        const d1 = String(default1 || '').trim();
        const d2 = String(default2 || '').trim();
        const defaults = uniqStrings([d1, d2]);
        return [...defaults, ...xs.filter(x => !defaults.includes(x))];
    }

    function getPreferencesFromUI() {
        const audioFromChecks = Array.from(document.querySelectorAll('input.gs-audio-lang'))
            .filter(x => x.checked)
            .map(x => String(x.value));
        const subsFromChecks = Array.from(document.querySelectorAll('input.gs-sub-lang'))
            .filter(x => x.checked)
            .map(x => String(x.value));

        const audioOther = parseCommaList(document.getElementById('gs-audio-other')?.value);
        const subsOther = parseCommaList(document.getElementById('gs-subs-other')?.value);

        const [defaultAudio1, defaultAudio2] = getDefaultPairFromUI('gs-default-audio-1', 'gs-default-audio-2');
        const [defaultSubs1, defaultSubs2] = getDefaultPairFromUI('gs-default-subs-1', 'gs-default-subs-2');

        // Include default languages in the list (they should be saved even if not in checkboxes)
        const audioLangs = uniqStrings([defaultAudio1, defaultAudio2, ...audioFromChecks, ...audioOther]);
        const subLangs = uniqStrings([defaultSubs1, defaultSubs2, ...subsFromChecks, ...subsOther]);

        return {
            audio_languages: audioLangs,
            subtitle_languages: subLangs,
        };
    }

    function fillPreferencesUI(prefs) {
        const p = prefs && typeof prefs === 'object' ? prefs : {};
        state.lastPreferences = p;

        const audioLangs = uniqStrings(p.audio_languages || []);
        const subLangs = uniqStrings(p.subtitle_languages || []);

        const [defaultAudio1, defaultAudio2] = [audioLangs[0] || '', audioLangs[1] || ''];
        const [defaultSubs1, defaultSubs2] = [subLangs[0] || '', subLangs[1] || ''];

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('gs-default-audio-1', defaultAudio1);
        setVal('gs-default-audio-2', defaultAudio2);
        setVal('gs-default-subs-1', defaultSubs1);
        setVal('gs-default-subs-2', defaultSubs2);

        const knownAudio = new Set(Array.from(document.querySelectorAll('input.gs-audio-lang')).map(cb => cb.value));
        const knownSubs = new Set(Array.from(document.querySelectorAll('input.gs-sub-lang')).map(cb => cb.value));

        document.querySelectorAll('input.gs-audio-lang').forEach(cb => {
            cb.checked = audioLangs.includes(cb.value);
        });
        document.querySelectorAll('input.gs-sub-lang').forEach(cb => {
            cb.checked = subLangs.includes(cb.value);
        });

        const audioOther = audioLangs.filter(x => !knownAudio.has(x) && x !== defaultAudio1 && x !== defaultAudio2).join(', ');
        const subsOther = subLangs.filter(x => !knownSubs.has(x) && x !== defaultSubs1 && x !== defaultSubs2).join(', ');

        setVal('gs-audio-other', audioOther);
        setVal('gs-subs-other', subsOther);

        const saveDefaults = document.getElementById('gs-save-defaults');
        if (saveDefaults) saveDefaults.checked = false;
    }

    async function loadPreferencesIntoModal() {
        try {
            const prefs = await apiGet('/api/preferences');
            state.lastPreferences = prefs && typeof prefs === 'object' ? prefs : {};
        } catch (e) {
            // Keep existing lastPreferences if API fails
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEARCH & RESULTS
    // ═══════════════════════════════════════════════════════════════════════════
    function renderResults(items) {
        state.searchResults = items || [];
        state.highlightedIndex = -1;
        const resultsBox = document.getElementById('gs-results');
        if (!resultsBox) return;

        if (!items || items.length === 0) {
            resultsBox.innerHTML = `
                <div style="padding: 24px; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px; opacity: 0.5;">🎬</div>
                    <div style="color: ${THEME.colors.text.secondary}; font-size: 13px;">No results found</div>
                    <div style="color: ${THEME.colors.text.muted}; font-size: 12px; margin-top: 4px;">Try a different search term</div>
                </div>
            `;
            resultsBox.style.display = 'block';
            return;
        }

        resultsBox.innerHTML = items.map((item, idx) => {
            const safeTitle = escapeHtml(item.title);
            const badgeClass = item.type === 'movie' ? 'gs-badge-movie' : 'gs-badge-tv';
            const badgeText = item.type === 'movie' ? 'Movie' : 'Series';
            const posterHtml = item.poster
                ? `<img src="${item.poster}" class="gs-poster" loading="lazy" />`
                : `<div class="gs-poster-placeholder">🎬</div>`;

            return `
                <button type="button" class="gs-result-item" data-index="${idx}">
                    ${posterHtml}
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 14px; font-weight: 600; color: ${THEME.colors.text.primary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px;">${safeTitle}</span>
                            <span class="gs-badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <div style="font-size: 12px; color: ${THEME.colors.text.secondary};">
                            ${item.year || '—'} • TMDB #${item.tmdb_id}
                        </div>
                    </div>
                    <div style="color: ${THEME.colors.text.muted}; font-size: 18px;">→</div>
                </button>
            `;
        }).join('');

        resultsBox.querySelectorAll('.gs-result-item').forEach((btn, idx) => {
            btn.addEventListener('click', () => selectResult(state.searchResults[idx]));
        });

        resultsBox.style.display = 'block';
        setRequestProcess('idle', 'Ready');
    }

    function renderHighlightedResults() {
        const items = document.querySelectorAll('.gs-result-item');
        items.forEach((item, idx) => {
            item.classList.toggle('highlighted', idx === state.highlightedIndex);
            if (idx === state.highlightedIndex) {
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    }

    async function selectResult(item) {
        state.selected = item;
        setIdleIfNoActiveRequest();
        showPanel('options');

        const title = document.getElementById('gs-selected-title');
        const meta = document.getElementById('gs-selected-meta');
        const poster = document.getElementById('gs-selected-poster');

        if (title) title.textContent = item.title || '—';
        if (meta) {
            const typeLabel = item.type === 'movie' ? 'Movie' : 'Series';
            meta.textContent = `${typeLabel} • ${item.year || '—'} • TMDB #${item.tmdb_id}`;
        }
        if (poster) poster.src = item.poster || CONFIG.TMDB_IMG_PLACEHOLDER;

        const collectionComplete = document.getElementById('gs-req-collection-complete');
        if (collectionComplete) collectionComplete.checked = false;

        // Load saved preferences into the options panel
        fillPreferencesUI(state.lastPreferences || {});
    }

    async function doSearch() {
        const input = document.getElementById('gs-search-input');
        if (!input) return;

        const q = input.value.trim();
        const resultsBox = document.getElementById('gs-results');

        if (state.searchTimer) clearTimeout(state.searchTimer);
        state.selected = null;
        state.confirmCandidates = [];
        showPanel('search');

        if (q.length < 2) {
            if (resultsBox) {
                resultsBox.innerHTML = `
                    <div style="padding: 24px; text-align: center;">
                        <div style="font-size: 32px; margin-bottom: 8px; opacity: 0.5;">🔍</div>
                        <div style="color: ${THEME.colors.text.secondary}; font-size: 13px;">Type to search</div>
                        <div style="color: ${THEME.colors.text.muted}; font-size: 12px; margin-top: 4px;">Enter at least 2 characters</div>
                    </div>
                `;
                resultsBox.style.display = 'block';
            }
            setIdleIfNoActiveRequest();
            return;
        }

        // Show loading state
        if (resultsBox) {
            resultsBox.innerHTML = `
                <div style="padding: 32px; text-align: center;">
                    <div class="gs-animate-spin" style="font-size: 24px; margin-bottom: 12px;">◐</div>
                    <div style="color: ${THEME.colors.text.secondary}; font-size: 13px;">Searching...</div>
                </div>
            `;
            resultsBox.style.display = 'block';
        }
        setRequestProcess('running', 'Searching...');

        state.searchTimer = setTimeout(async () => {
            try {
                state.currentMode = getModeFromUI();
                const data = await apiGet(`/api/request/search?q=${encodeURIComponent(q)}&types=${encodeURIComponent(state.currentMode)}&limit=10`);

                const results = Array.isArray(data?.results) ? data.results.slice() : [];
                const qNorm = String(q).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

                const scoreTitle = (title) => {
                    const tNorm = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                    if (!qNorm || !tNorm) return 0;
                    if (tNorm === qNorm) return 100;
                    if (tNorm.startsWith(qNorm)) return 80;
                    if (tNorm.includes(qNorm)) return 40;
                    return 0;
                };

                const ranked = results
                    .map((r, idx) => ({ r, idx, s: scoreTitle(r?.title) }))
                    .sort((a, b) => (b.s - a.s) || (a.idx - b.idx))
                    .map(x => x.r)
                    .slice(0, CONFIG.MAX_RESULTS);

                renderResults(ranked);
            } catch (e) {
                if (resultsBox) {
                    resultsBox.innerHTML = `
                        <div style="padding: 24px; text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
                            <div style="color: ${THEME.colors.accent.red}; font-size: 13px;">Search failed</div>
                            <div style="color: ${THEME.colors.text.muted}; font-size: 12px; margin-top: 4px;">${escapeHtml(e.message)}</div>
                        </div>
                    `;
                    resultsBox.style.display = 'block';
                }
                setRequestProcess('error', 'Search error');
            }
        }, CONFIG.SEARCH_DEBOUNCE_MS);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIRM CANDIDATES
    // ═══════════════════════════════════════════════════════════════════════════
    function normalizeCandidateList(seedFallback, expandRes) {
        const out = [];
        const seen = new Set();

        function add(x) {
            if (!x) return;
            const type = String(x.type || '').toLowerCase();
            const tmdbId = Number(x.tmdb_id);
            if (!['movie', 'tv'].includes(type)) return;
            if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;

            const k = `${type}:${tmdbId}`;
            if (seen.has(k)) return;
            seen.add(k);

            out.push({
                type,
                tmdb_id: tmdbId,
                title: x.title || '—',
                year: x.year || '',
                poster: x.poster || '',
                reason: x.reason || '',
            });
        }

        if (expandRes && typeof expandRes === 'object') {
            add(expandRes.seed);
            (expandRes.candidates || []).forEach(add);
        }
        add(seedFallback);
        return out;
    }

    function renderConfirmCandidates(items) {
        const box = document.getElementById('gs-confirm-list');
        if (!box) return;

        const list = items || [];
        box.innerHTML = list.map((it, idx) => {
            const safeTitle = escapeHtml(it.title);
            const badgeClass = it.type === 'movie' ? 'gs-badge-movie' : 'gs-badge-tv';
            const badgeText = it.type === 'movie' ? 'Movie' : 'Series';
            const posterHtml = it.poster
                ? `<img src="${it.poster}" class="gs-poster" loading="lazy" />`
                : `<div class="gs-poster-placeholder">🎬</div>`;
            const reasonHtml = it.reason
                ? `<span style="font-size: 10px; padding: 2px 8px; border-radius: ${THEME.radius.full}; background: ${THEME.colors.bg.card}; color: ${THEME.colors.text.secondary}; border: 1px solid ${THEME.colors.border.light};">${escapeHtml(it.reason)}</span>`
                : '';
            const allowed = allowedByMode(it.type);
            const disabledStyle = allowed ? '' : 'opacity: 0.4;';
            const disabledNote = allowed ? '' : `<div style="font-size: 11px; color: ${THEME.colors.accent.yellow}; margin-top: 2px;">Disabled by mode filter</div>`;

            return `
                <label class="gs-animate-slideUp" style="display: flex; gap: 12px; align-items: center; padding: 12px; border-bottom: 1px solid ${THEME.colors.border.light}; cursor: ${allowed ? 'pointer' : 'not-allowed'}; ${disabledStyle}; transition: ${THEME.transition.fast};" onmouseenter="this.style.background='${allowed ? THEME.colors.bg.hover : 'transparent'}'" onmouseleave="this.style.background='transparent'">
                    <input class="gs-checkbox gs-confirm-cb" data-idx="${idx}" type="checkbox" ${allowed ? 'checked' : ''} ${allowed ? '' : 'disabled'} />
                    ${posterHtml}
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 14px; font-weight: 600; color: ${THEME.colors.text.primary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">${safeTitle}</span>
                            <span class="gs-badge ${badgeClass}">${badgeText}</span>
                            ${reasonHtml}
                        </div>
                        <div style="font-size: 12px; color: ${THEME.colors.text.secondary};">
                            ${it.year || '—'} • TMDB #${it.tmdb_id}
                        </div>
                        ${disabledNote}
                    </div>
                </label>
            `;
        }).join('');

        const updateCount = () => {
            const cbs = Array.from(document.querySelectorAll('input.gs-confirm-cb'));
            const selectedCount = cbs.filter(cb => cb.checked && !cb.disabled).length;
            const out = document.getElementById('gs-confirm-count');
            if (out) out.textContent = `${selectedCount} selected`;
        };

        box.querySelectorAll('input.gs-confirm-cb').forEach(cb => {
            cb.addEventListener('change', updateCount);
        });
        updateCount();
    }

    function selectAllConfirm(selectState) {
        document.querySelectorAll('input.gs-confirm-cb').forEach(cb => {
            if (!cb.disabled) cb.checked = !!selectState;
        });

        const cbs = Array.from(document.querySelectorAll('input.gs-confirm-cb'));
        const selectedCount = cbs.filter(cb => cb.checked && !cb.disabled).length;
        const out = document.getElementById('gs-confirm-count');
        if (out) out.textContent = `${selectedCount} selected`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROGRESS & POLLING
    // ═══════════════════════════════════════════════════════════════════════════
    function setProgressText(text) {
        const t = document.getElementById('gs-progress-text');
        if (t) t.textContent = text || '';
    }

    function setProgressJson(obj) {
        const pre = document.getElementById('gs-progress-json');
        if (!pre) return;
        try {
            pre.textContent = JSON.stringify(obj || {}, null, 2);
        } catch (e) {
            pre.textContent = String(obj || '');
        }
    }

    function inferDone(st) {
        const s = st && typeof st === 'object' ? st : {};
        const statusVal = String(s.state || s.status || '').toLowerCase();
        const doneStates = ['completed', 'complete', 'done', 'success', 'failed', 'error', 'stopped', 'cancelled', 'canceled'];
        if (doneStates.includes(statusVal)) return true;
        if (s.done === true) return true;
        if (s.running === false && statusVal) return true;
        return false;
    }

    function inferLabel(st) {
        const s = st && typeof st === 'object' ? st : {};
        const parts = [
            String(s.state || s.status || '').trim(),
            String(s.phase || s.step || '').trim(),
            String(s.message || s.detail || '').trim(),
        ].filter(Boolean);
        return parts.join(' • ');
    }

    async function pollRequestStatus(reqId) {
        stopRequestStatusPolling();
        if (!reqId) return;

        let consecutiveErrors = 0;

        const tick = async () => {
            try {
                const st = await apiGet(`/api/request/status?request_id=${encodeURIComponent(String(reqId))}`);
                consecutiveErrors = 0;

                const label = inferLabel(st) || 'Processing...';
                setProgressText(label);
                setProgressJson(st);

                if (inferDone(st)) {
                    stopRequestStatusPolling();
                    state.requestId = null;
                    const statusVal = String(st.state || st.status || '').toLowerCase();
                    const successStates = ['completed', 'complete', 'done', 'success'];
                    if (successStates.includes(statusVal)) {
                        setRequestProcess('success', 'Completed');
                    } else {
                        setRequestProcess('error', statusVal || 'Finished');
                    }
                    return;
                }

                setRequestProcess('running', 'Processing...');
                state.requestStatusPollTimer = setTimeout(tick, CONFIG.POLL_INTERVAL_MS);
            } catch (e) {
                consecutiveErrors++;
                if (consecutiveErrors >= CONFIG.MAX_POLL_ERRORS) {
                    stopRequestStatusPolling();
                    setRequestProcess('error', 'Status error');
                    setProgressText('Status error: Unable to reach server');
                    return;
                }
                state.requestStatusPollTimer = setTimeout(tick, CONFIG.POLL_ERROR_INTERVAL_MS);
            }
        };

        setRequestProcess('running', 'Processing...');
        state.requestStatusPollTimer = setTimeout(tick, 600);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FORM SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════════
    async function goToConfirmStep() {
        if (!state.selected) return;

        const status = document.getElementById('gs-request-status');
        if (status) status.textContent = '';

        const wantCollectionComplete = document.getElementById('gs-req-collection-complete')?.checked || false;
        const seed = {
            type: String(state.selected.type || '').toLowerCase(),
            tmdb_id: Number(state.selected.tmdb_id),
            title: state.selected.title || '—',
            year: state.selected.year || '',
            poster: state.selected.poster || '',
        };

        try {
            setRequestProcess('running', wantCollectionComplete ? 'Expanding...' : 'Preparing...');
            let expanded = null;

            if (wantCollectionComplete) {
                const r = await apiPost('/api/request/expand', {
                    type: seed.type,
                    tmdb_id: seed.tmdb_id,
                });
                if (!r.ok) throw new Error(r.data?.message || `Expand failed (${r.status})`);
                expanded = r.data;
            }

            state.confirmCandidates = normalizeCandidateList(seed, expanded);
            renderConfirmCandidates(state.confirmCandidates);
            showPanel('confirm');
            setIdleIfNoActiveRequest();
        } catch (e) {
            setRequestProcess('error', 'Expand error');
            if (status) status.textContent = `Error: ${e.message}`;
        }
    }

    async function submitConfirmedRequest() {
        const status = document.getElementById('gs-request-status');
        if (status) status.textContent = '';

        const saveDefaults = document.getElementById('gs-save-defaults')?.checked || false;

        if (saveDefaults) {
            try {
                setRequestProcess('running', 'Saving...');
                const prefs = getPreferencesFromUI();
                const r = await apiPut('/api/preferences', prefs);
                if (!r.ok) throw new Error(r.data?.message || `Save defaults failed (${r.status})`);
            } catch (e) {
                setRequestProcess('error', 'Prefs error');
                if (status) status.textContent = `Preferences error: ${e.message}`;
                return;
            }
        }

        const cbs = Array.from(document.querySelectorAll('input.gs-confirm-cb'));
        const picked = cbs
            .filter(cb => cb.checked && !cb.disabled)
            .map(cb => state.confirmCandidates[Number(cb.getAttribute('data-idx'))])
            .filter(Boolean)
            .filter(it => allowedByMode(it.type));

        const movieIds = [...new Set(picked.filter(x => x.type === 'movie').map(x => Number(x.tmdb_id)).filter(n => Number.isFinite(n)))];
        const tvIds = [...new Set(picked.filter(x => x.type === 'tv').map(x => Number(x.tmdb_id)).filter(n => Number.isFinite(n)))];

        const payload = {
            movie_tmdb_ids: state.currentMode === 'tv' ? [] : movieIds,
            tv_tmdb_ids: state.currentMode === 'movie' ? [] : tvIds,
        };

        if (payload.movie_tmdb_ids.length === 0 && payload.tv_tmdb_ids.length === 0) {
            setRequestProcess('error', 'Nothing selected');
            if (status) status.textContent = 'Select at least one item.';
            return;
        }

        try {
            setRequestProcess('running', 'Submitting...');
            const r = await apiPost('/api/request/submit', payload);
            if (!r.ok) throw new Error(r.data?.message || `Submit failed (${r.status})`);
            state.requestId = r.data?.request_id || null;
            if (!state.requestId) throw new Error('Missing request_id');

            const rid = document.getElementById('gs-progress-request-id');
            if (rid) rid.textContent = String(state.requestId);
            setProgressText('Queued');
            setProgressJson({ request_id: state.requestId });
            showPanel('progress');
            await pollRequestStatus(state.requestId);
        } catch (e) {
            setRequestProcess('error', 'Submit error');
            if (status) status.textContent = `Submit error: ${e.message}`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD UI
    // ═══════════════════════════════════════════════════════════════════════════
    function buildSpotlightModal() {
        // Overlay
        const overlay = el('div', {
            id: 'gs-overlay',
            style: {
                position: 'fixed',
                inset: '0',
                background: THEME.colors.bg.overlay,
                backdropFilter: 'blur(8px)',
                zIndex: '999999',
                display: 'none',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '60px 20px 20px',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
            },
        });

        // Modal container
        const modal = el('div', {
            class: 'gs-animate-fadeIn',
            style: {
                width: '600px',
                maxWidth: '95vw',
                maxHeight: 'calc(100vh - 80px)',
                borderRadius: THEME.radius.lg,
                border: `1px solid ${THEME.colors.border.default}`,
                background: THEME.colors.bg.modal,
                boxShadow: THEME.shadow.lg,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            },
        });

        // Search header
        const searchHeader = el('div', {
            style: {
                padding: '16px',
                borderBottom: `1px solid ${THEME.colors.border.light}`,
            },
        }, [
            // Search input with icon
            el('div', {
                style: {
                    position: 'relative',
                    marginBottom: '12px',
                },
            }, [
                el('span', {
                    style: {
                        position: 'absolute',
                        left: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '16px',
                        color: THEME.colors.text.muted,
                        pointerEvents: 'none',
                    },
                }, ['🔍']),
                el('input', {
                    id: 'gs-search-input',
                    type: 'search',
                    class: 'gs-input',
                    placeholder: 'Search movies or TV shows...',
                    style: {
                        paddingLeft: '42px',
                    },
                }),
            ]),
            // Mode toggles
            el('div', {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                },
            }, [
                el('span', {
                    style: {
                        fontSize: '12px',
                        color: THEME.colors.text.muted,
                        fontWeight: '500',
                    },
                }, ['Filter:']),
                ...['movie', 'tv', 'both'].map(mode => {
                    const labels = { movie: 'Movies', tv: 'Series', both: 'All' };
                    const icons = { movie: '🎬', tv: '📺', both: '✨' };
                    return el('label', {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            color: THEME.colors.text.secondary,
                            cursor: 'pointer',
                        },
                    }, [
                        el('input', {
                            type: 'radio',
                            name: 'gs-mode',
                            value: mode,
                            class: 'gs-radio',
                        }),
                        el('span', {}, [`${icons[mode]} ${labels[mode]}`]),
                    ]);
                }),
            ]),
        ]);

        // Results container
        const resultsBox = el('div', {
            id: 'gs-results',
            class: 'gs-scrollbar',
            style: {
                flex: '1 1 auto',
                minHeight: '0',
                maxHeight: '400px',
                overflowY: 'auto',
                display: 'none',
            },
        });

        // Options panel
        const optionsBox = buildOptionsPanel();

        // Confirm panel
        const confirmBox = buildConfirmPanel();

        // Progress panel
        const progressBox = buildProgressPanel();

        modal.appendChild(searchHeader);
        modal.appendChild(resultsBox);
        modal.appendChild(optionsBox);
        modal.appendChild(confirmBox);
        modal.appendChild(progressBox);
        overlay.appendChild(modal);

        return overlay;
    }

    function buildOptionsPanel() {
        const panel = el('div', {
            id: 'gs-options',
            class: 'gs-scrollbar',
            style: {
                padding: '16px',
                display: 'none',
                flexDirection: 'column',
                gap: '16px',
                overflowY: 'auto',
                flex: '1 1 auto',
                minHeight: '0',
            },
        });

        // Selected item info
        const selectedInfo = el('div', {
            class: 'gs-card',
            style: {
                display: 'flex',
                gap: '14px',
                alignItems: 'center',
            },
        }, [
            el('img', {
                id: 'gs-selected-poster',
                src: CONFIG.TMDB_IMG_PLACEHOLDER,
                style: {
                    width: '56px',
                    height: '84px',
                    objectFit: 'cover',
                    borderRadius: THEME.radius.sm,
                    background: THEME.colors.bg.card,
                },
            }),
            el('div', {
                style: {
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                },
            }, [
                el('div', {
                    id: 'gs-selected-title',
                    style: {
                        fontSize: '16px',
                        fontWeight: '700',
                        color: THEME.colors.text.primary,
                    },
                }, ['—']),
                el('div', {
                    id: 'gs-selected-meta',
                    style: {
                        fontSize: '13px',
                        color: THEME.colors.text.secondary,
                    },
                }, ['—']),
            ]),
        ]);

        // Collection expand toggle
        const collectionToggle = el('div', {
            class: 'gs-card',
        }, [
            el('label', {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                },
            }, [
                el('input', {
                    type: 'checkbox',
                    id: 'gs-req-collection-complete',
                    class: 'gs-checkbox',
                }),
                el('div', {}, [
                    el('div', {
                        style: {
                            fontSize: '13px',
                            fontWeight: '600',
                            color: THEME.colors.text.primary,
                        },
                    }, ['Expand collection']),
                    el('div', {
                        style: {
                            fontSize: '11px',
                            color: THEME.colors.text.muted,
                            marginTop: '2px',
                        },
                    }, ['Fetch related movies/seasons and select which to request']),
                ]),
            ]),
        ]);



        // Language datalist
        const langDatalist = el('datalist', { id: 'gs-lang-codes' }, LANGUAGES.map(l => el('option', { value: l.code, label: `${l.flag} ${l.label}` }, [])));

        // Audio languages section
        const audioSection = buildLanguageSection('Audio', 'gs-audio', 'gs-default-audio');

        // Subtitle languages section
        const subsSection = buildLanguageSection('Subtitles', 'gs-sub', 'gs-default-subs');

        // Save defaults toggle
        const saveDefaultsSection = el('div', {
            class: 'gs-card',
        }, [
            el('label', {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                },
            }, [
                el('input', {
                    type: 'checkbox',
                    id: 'gs-save-defaults',
                    class: 'gs-checkbox',
                }),
                el('div', {}, [
                    el('div', {
                        style: {
                            fontSize: '13px',
                            fontWeight: '600',
                            color: THEME.colors.text.primary,
                        },
                    }, ['Save as defaults']),
                    el('div', {
                        style: {
                            fontSize: '11px',
                            color: THEME.colors.text.muted,
                            marginTop: '2px',
                        },
                    }, ['Remember these preferences for future requests']),
                ]),
            ]),
        ]);

        // Status message
        const status = el('div', {
            id: 'gs-request-status',
            style: {
                fontSize: '12px',
                color: THEME.colors.accent.red,
                minHeight: '18px',
            },
        });

        // Continue button
        const continueBtn = el('button', {
            type: 'button',
            class: 'gs-btn gs-btn-primary',
            style: { width: '100%' },
            onClick: goToConfirmStep,
        }, ['Continue →']);

        panel.appendChild(selectedInfo);
        panel.appendChild(collectionToggle);
        panel.appendChild(langDatalist);
        panel.appendChild(audioSection);
        panel.appendChild(subsSection);
        panel.appendChild(saveDefaultsSection);
        panel.appendChild(status);
        panel.appendChild(continueBtn);

        return panel;
    }

    function buildLanguageSection(title, langClass, defaultIdPrefix) {
        const section = el('div', {}, [
            el('div', { class: 'gs-section-title' }, [`${title} Languages`]),
            // Default language inputs
            el('div', {
                style: {
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '10px',
                },
            }, [
                el('div', {
                    style: { flex: '1' },
                }, [
                    el('label', {
                        style: {
                            fontSize: '11px',
                            color: THEME.colors.text.muted,
                            marginBottom: '4px',
                            display: 'block',
                        },
                    }, ['Primary']),
                    el('input', {
                        id: `${defaultIdPrefix}-1`,
                        type: 'text',
                        class: 'gs-input gs-input-sm',
                        placeholder: 'en',
                        list: 'gs-lang-codes',
                    }),
                ]),
                el('div', {
                    style: { flex: '1' },
                }, [
                    el('label', {
                        style: {
                            fontSize: '11px',
                            color: THEME.colors.text.muted,
                            marginBottom: '4px',
                            display: 'block',
                        },
                    }, ['Secondary']),
                    el('input', {
                        id: `${defaultIdPrefix}-2`,
                        type: 'text',
                        class: 'gs-input gs-input-sm',
                        placeholder: '(optional)',
                        list: 'gs-lang-codes',
                    }),
                ]),
            ]),
            // Language checkboxes grid
            el('div', {
                style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '6px',
                    marginBottom: '10px',
                },
            }, LANGUAGES.slice(0, 8).map(lang =>
                el('label', {
                    class: 'gs-card',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        padding: '8px 10px',
                    },
                }, [
                    el('input', {
                        type: 'checkbox',
                        value: lang.code,
                        class: `gs-checkbox ${langClass}-lang`,
                    }),
                    el('span', {
                        style: {
                            fontSize: '12px',
                            color: THEME.colors.text.secondary,
                        },
                    }, [`${lang.flag} ${lang.label}`]),
                ])
            )),
            // Other languages input
            el('input', {
                id: `${langClass}s-other`,
                type: 'text',
                class: 'gs-input gs-input-sm',
                placeholder: 'Other language codes (comma-separated)',
            }),
        ]);

        return section;
    }

    function buildConfirmPanel() {
        const panel = el('div', {
            id: 'gs-confirm',
            style: {
                padding: '16px',
                display: 'none',
                flexDirection: 'column',
                flex: '1 1 auto',
                minHeight: '0',
                overflow: 'hidden',
            },
        });

        // Header
        const header = el('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
            },
        }, [
            el('div', {
                style: {
                    fontSize: '15px',
                    fontWeight: '700',
                    color: THEME.colors.text.primary,
                },
            }, ['Confirm Selection']),
            el('div', {
                id: 'gs-confirm-count',
                style: {
                    fontSize: '12px',
                    color: THEME.colors.text.secondary,
                    background: THEME.colors.bg.card,
                    padding: '4px 10px',
                    borderRadius: THEME.radius.full,
                },
            }, ['0 selected']),
        ]);

        // Actions
        const actions = el('div', {
            style: {
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
            },
        }, [
            el('button', {
                type: 'button',
                class: 'gs-btn gs-btn-ghost',
                style: { padding: '6px 12px', fontSize: '12px' },
                onClick: () => selectAllConfirm(true),
            }, ['Select all']),
            el('button', {
                type: 'button',
                class: 'gs-btn gs-btn-ghost',
                style: { padding: '6px 12px', fontSize: '12px' },
                onClick: () => selectAllConfirm(false),
            }, ['Clear']),
            el('div', { style: { flex: '1' } }),
            el('button', {
                type: 'button',
                class: 'gs-btn gs-btn-ghost',
                style: { padding: '6px 12px', fontSize: '12px' },
                onClick: () => showPanel('options'),
            }, ['← Back']),
        ]);

        // Candidates list
        const list = el('div', {
            id: 'gs-confirm-list',
            class: 'gs-scrollbar',
            style: {
                flex: '1 1 auto',
                minHeight: '0',
                overflowY: 'auto',
                borderRadius: THEME.radius.md,
                border: `1px solid ${THEME.colors.border.light}`,
                background: THEME.colors.bg.card,
                marginBottom: '12px',
            },
        });

        // Submit button
        const submitBtn = el('button', {
            type: 'button',
            class: 'gs-btn gs-btn-success',
            style: { width: '100%' },
            onClick: submitConfirmedRequest,
        }, ['Submit Request']);

        panel.appendChild(header);
        panel.appendChild(actions);
        panel.appendChild(list);
        panel.appendChild(submitBtn);

        return panel;
    }

    function buildProgressPanel() {
        const panel = el('div', {
            id: 'gs-progress',
            style: {
                padding: '16px',
                display: 'none',
                flexDirection: 'column',
                flex: '1 1 auto',
                minHeight: '0',
                overflow: 'hidden',
            },
        });

        // Header
        const header = el('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '16px',
            },
        }, [
            el('div', {
                class: 'gs-animate-pulse',
                style: {
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: THEME.colors.accent.green,
                },
            }),
            el('div', {
                style: {
                    fontSize: '15px',
                    fontWeight: '700',
                    color: THEME.colors.text.primary,
                },
            }, ['Request Status']),
        ]);

        // Request ID
        const requestIdRow = el('div', {
            class: 'gs-card',
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
            },
        }, [
            el('span', {
                style: {
                    fontSize: '12px',
                    color: THEME.colors.text.muted,
                },
            }, ['Request ID']),
            el('span', {
                id: 'gs-progress-request-id',
                style: {
                    fontSize: '12px',
                    fontWeight: '600',
                    color: THEME.colors.text.primary,
                    fontFamily: 'monospace',
                },
            }, ['—']),
        ]);

        // Status text
        const statusText = el('div', {
            id: 'gs-progress-text',
            style: {
                fontSize: '13px',
                color: THEME.colors.text.secondary,
                marginBottom: '12px',
                padding: '10px 12px',
                background: THEME.colors.bg.card,
                borderRadius: THEME.radius.sm,
            },
        });

        // JSON output
        const jsonOutput = el('pre', {
            id: 'gs-progress-json',
            class: 'gs-scrollbar',
            style: {
                flex: '1 1 auto',
                minHeight: '0',
                overflow: 'auto',
                padding: '12px',
                borderRadius: THEME.radius.md,
                border: `1px solid ${THEME.colors.border.light}`,
                background: THEME.colors.bg.card,
                color: THEME.colors.text.secondary,
                fontSize: '11px',
                fontFamily: 'monospace',
                margin: '0',
                marginBottom: '12px',
            },
        }, ['{}']);

        // Back button
        const backBtn = el('button', {
            type: 'button',
            class: 'gs-btn gs-btn-ghost',
            style: { width: '100%' },
            onClick: () => showPanel('search'),
        }, ['← Back to search']);

        panel.appendChild(header);
        panel.appendChild(requestIdRow);
        panel.appendChild(statusText);
        panel.appendChild(jsonOutput);
        panel.appendChild(backBtn);

        return panel;
    }

    function buildTriggerButton() {
        return el('button', {
            type: 'button',
            class: 'gs-tooltip',
            'data-tooltip': 'Ctrl+K',
            style: {
                marginLeft: '10px',
                padding: '8px 14px',
                borderRadius: THEME.radius.full,
                border: `1px solid rgba(59, 130, 246, 0.4)`,
                background: THEME.colors.accent.blueBg,
                color: THEME.colors.accent.blue,
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: THEME.transition.fast,
            },
            onClick: openSpotlight,
            onMouseenter: function () {
                this.style.background = 'rgba(59, 130, 246, 0.25)';
                this.style.transform = 'translateY(-1px)';
            },
            onMouseleave: function () {
                this.style.background = THEME.colors.accent.blueBg;
                this.style.transform = 'translateY(0)';
            },
        }, [
            el('span', {}, ['🔍']),
            el('span', {}, ['Request']),
        ]);
    }

    function buildStatusBadge() {
        const badge = el('span', {
            class: 'gs-status-badge',
            style: {
                marginLeft: '8px',
                padding: '6px 12px',
                borderRadius: THEME.radius.full,
                border: `1px solid ${THEME.colors.border.default}`,
                background: THEME.colors.bg.card,
                color: THEME.colors.text.secondary,
                fontSize: '11px',
                fontWeight: '500',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: THEME.transition.fast,
            },
        }, [
            el('span', { class: 'gs-status-icon' }, ['○']),
            el('span', { class: 'gs-status-label' }, ['Ready']),
        ]);
        return badge;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MOUNT & EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════
    function mount() {
        if (document.getElementById('gs-overlay')) return;

        const anchor = findPlexSearchAnchor();
        if (!anchor?.parentElement) return;

        // Add modal
        const overlay = buildSpotlightModal();
        document.body.appendChild(overlay);

        // Set default mode
        setModeInUI('both');

        // Add trigger button and status badge
        const btn = buildTriggerButton();
        anchor.parentElement.insertBefore(btn, anchor.nextSibling);

        const statusBadge = buildStatusBadge();
        anchor.parentElement.insertBefore(statusBadge, btn.nextSibling);

        setRequestProcess('idle', 'Ready');

        // Event listeners
        const input = document.getElementById('gs-search-input');
        if (input) {
            input.addEventListener('input', doSearch);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeSpotlight();
                    return;
                }

                if (state.searchResults.length === 0) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    state.highlightedIndex = (state.highlightedIndex + 1) % state.searchResults.length;
                    renderHighlightedResults();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    state.highlightedIndex = (state.highlightedIndex - 1 + state.searchResults.length) % state.searchResults.length;
                    renderHighlightedResults();
                } else if (e.key === 'Enter' && state.highlightedIndex >= 0) {
                    e.preventDefault();
                    selectResult(state.searchResults[state.highlightedIndex]);
                }
            });
        }

        // Mode change handler
        document.querySelectorAll('input[name="gs-mode"]').forEach(r => {
            r.addEventListener('change', () => {
                state.currentMode = getModeFromUI();
                doSearch();
            });
        });

        // Overlay click to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSpotlight();
        });
    }

    // Observe DOM for Plex UI changes
    const observer = new MutationObserver(() => mount());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    mount();

    // Global keyboard shortcut
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('gs-overlay');

        if (e.key === 'Escape' && overlay?.style.display !== 'none') {
            e.preventDefault();
            closeSpotlight();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            e.stopPropagation();
            openSpotlight();
        }
    }, true);
})();
