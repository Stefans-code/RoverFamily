/**
 * COMUNE DI ROVERETO - ROVERFAMILY DASHBOARD
 * Application JavaScript Logic
 * v3.0 — Landing + Auth + Premium Design
 */

// ─── Mock ANPR Family Registry ───────────────────────────────────
const MOCK_SPID_PROFILES = {
    rossi:   { quartiere: 'Borgo Sacco',    children: [{ name: 'Luca', age: 1 }, { name: 'Sofia', age: 4 }] },
    bianchi: { quartiere: 'Centro Storico', children: [{ name: 'Emma', age: 2 }] },
    verdi:   { quartiere: 'Brione',         children: [{ name: 'Matteo', age: 5 }, { name: 'Chiara', age: 3 }, { name: 'Andrea', age: 0 }] },
    ferrari: { quartiere: 'Lizzana',        children: [{ name: 'Davide', age: 6 }, { name: 'Elena', age: 2 }] }
};

// ─── Application State ───────────────────────────────────────────
const state = {
    data: null,
    voiceEnabled: false,
    fontSizeScale: 1.0,
    theme: 'theme-dark',
    familyProfile: { quartiere: '', children: [] },
    chatHistory: [],
    lastTopic: null,
    lastChildContext: null,
    map: null,
    mapTileLayer: null,
    mapMarkersGroup: null,
    voiceRate: 1.0,
    voiceVolume: 1.0,
    selectedVoiceName: '',
    voiceAutoRead: true,
    newsFilterRelevance: 'for-me',
    newsFilterCategory: 'all',
    isSpidLoggedIn: false,
    // Auth state
    currentUser: null,   // { name, email, anprProfile? }
};

// ─── User Account Helpers (localStorage) ─────────────────────────
function getUsers() {
    try { return JSON.parse(localStorage.getItem('roverfamily_users') || '[]'); } catch { return []; }
}
function saveUsers(users) {
    localStorage.setItem('roverfamily_users', JSON.stringify(users));
}
function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('roverfamily_current_user') || 'null'); } catch { return null; }
}
function setCurrentUser(user) {
    if (user) {
        localStorage.setItem('roverfamily_current_user', JSON.stringify(user));
    } else {
        localStorage.removeItem('roverfamily_current_user');
    }
    state.currentUser = user;
    updateUserPill();
}
function updateUserPill() {
    const pill = document.getElementById('userPill');
    const pillName = document.getElementById('userPillName');
    const btnHeaderLogin = document.getElementById('btnHeaderLogin');
    if (state.currentUser) {
        if (pill) { pill.style.display = 'flex'; }
        if (pillName) { pillName.textContent = state.currentUser.name.split(' ')[0]; }
        if (btnHeaderLogin) btnHeaderLogin.style.display = 'none';
    } else {
        if (pill) { pill.style.display = 'none'; }
        if (btnHeaderLogin) btnHeaderLogin.style.display = 'inline-flex';
    }
}

// ─── Panel Routing ────────────────────────────────────────────────
function showPanel(panelId) {
    const panels = ['panel-landing', 'panel-auth', 'panel-setup', 'panel-dashboard'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === panelId) {
            el.style.display = 'block';
            el.classList.add('active');
            // trigger reflow for animation
            void el.offsetWidth;
        } else {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });
}

// LocalStorage Persistence Helpers
function saveStateToLocalStorage() {
    try {
        const dataToSave = {
            familyProfile: state.familyProfile,
            fontSizeScale: state.fontSizeScale,
            theme: state.theme,
            voiceEnabled: state.voiceEnabled,
            chatHistory: state.chatHistory,
            lastTopic: state.lastTopic,
            lastChildContext: state.lastChildContext,
            voiceRate: state.voiceRate,
            voiceVolume: state.voiceVolume,
            selectedVoiceName: state.selectedVoiceName,
            voiceAutoRead: state.voiceAutoRead,
            newsFilterRelevance: state.newsFilterRelevance,
            newsFilterCategory: state.newsFilterCategory,
            isSpidLoggedIn: state.isSpidLoggedIn
        };
        localStorage.setItem('roverfamily_state', JSON.stringify(dataToSave));
    } catch (e) {
        console.warn("Failed to save state to localStorage:", e);
    }
}

function loadStateFromLocalStorage() {
    try {
        const saved = localStorage.getItem('roverfamily_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.familyProfile) state.familyProfile = parsed.familyProfile;
            if (parsed.fontSizeScale) state.fontSizeScale = parsed.fontSizeScale;
            if (parsed.theme) state.theme = parsed.theme;
            if (parsed.voiceEnabled) state.voiceEnabled = parsed.voiceEnabled;
            if (parsed.chatHistory) state.chatHistory = parsed.chatHistory;
            if (parsed.lastTopic) state.lastTopic = parsed.lastTopic;
            if (parsed.lastChildContext) state.lastChildContext = parsed.lastChildContext;
            if (parsed.voiceRate !== undefined) state.voiceRate = parsed.voiceRate;
            if (parsed.voiceVolume !== undefined) state.voiceVolume = parsed.voiceVolume;
            if (parsed.selectedVoiceName !== undefined) state.selectedVoiceName = parsed.selectedVoiceName;
            if (parsed.voiceAutoRead !== undefined) state.voiceAutoRead = parsed.voiceAutoRead;
            if (parsed.newsFilterRelevance !== undefined) state.newsFilterRelevance = parsed.newsFilterRelevance;
            if (parsed.newsFilterCategory !== undefined) state.newsFilterCategory = parsed.newsFilterCategory;
            if (parsed.isSpidLoggedIn !== undefined) state.isSpidLoggedIn = parsed.isSpidLoggedIn;
            return true;
        }
    } catch (e) {
        console.warn("Failed to load state from localStorage:", e);
    }
    return false;
}

function restoreChatHistoryUI() {
    const historyContainer = document.getElementById('ai-chat-history');
    if (!historyContainer) return;
    
    if (!state.chatHistory || state.chatHistory.length === 0) {
        resetAiAdvisor();
        return;
    }
    
    historyContainer.innerHTML = '';
    state.chatHistory.forEach(msg => {
        const msgCard = document.createElement('div');
        if (msg.role === 'user') {
            msgCard.className = 'ai-message ai-message-user';
            msgCard.innerHTML = `
                <div class="message-icon"><i class="fa-solid fa-user"></i></div>
                <div class="message-text"><p>${escapeHtml(msg.text)}</p></div>
            `;
        } else {
            msgCard.className = 'ai-message ai-message-system speakable-card';
            msgCard.innerHTML = `
                <div class="message-icon"><i class="fa-solid fa-robot"></i></div>
                <div class="message-text">${msg.text}</div>
            `;
            // Click to speak trigger
            msgCard.addEventListener('click', () => {
                if (state.voiceEnabled) {
                    speakVoice(msgCard.querySelector('.message-text').textContent);
                }
            });
        }
        historyContainer.appendChild(msgCard);
    });
    historyContainer.scrollTop = historyContainer.scrollHeight;
}

// Clock Management
function initClock() {
    const clockEl = document.getElementById('clockTime');
    if (!clockEl) return;
    
    // Set immediate time
    clockEl.textContent = new Date().toLocaleTimeString('it-IT');
    
    setInterval(() => {
        clockEl.textContent = new Date().toLocaleTimeString('it-IT');
    }, 1000);
}

// Tabbed Layout Navigation Engine
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            if (!targetTab) return;
            
            // Switch active classes on buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Switch active classes on contents
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
            
            // Recalculate Leaflet map layout if structures tab is shown
            if (targetTab === 'tab-structures' && state.map) {
                setTimeout(() => {
                    state.map.invalidateSize();
                }, 150);
            }
        });
    });
}

function switchTab(tabId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) {
        btn.click();
    }
}

// Personalized Reminders / Notifications Feed Generator
function renderPersonalizedReminders() {
    const container = document.getElementById('reminders-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    const profile = state.familyProfile;
    
    if (!profile || !profile.children) return;
    
    const reminders = [];
    
    // 1. Children Age Group Analysis
    const kids03 = profile.children.filter(c => c.age >= 0 && c.age <= 3);
    const kids36 = profile.children.filter(c => c.age > 3 && c.age <= 6);
    
    kids03.forEach(child => {
        reminders.push({
            title: `Bando Nidi d'Infanzia: Iscrizione per ${child.name}`,
            text: `Le iscrizioni comunali per i nidi d'infanzia per ${child.name} (${child.age} ${child.age === 1 ? 'anno' : 'anni'}) apriranno dal 1° al 30 giugno. Ricordati di munirti dell'attestazione ISEE in tempo.`,
            priority: 'high',
            icon: 'fa-solid fa-circle-exclamation',
            actionText: 'Consulta Asili Nido Vicini',
            actionTab: 'tab-structures'
        });
        
        reminders.push({
            title: `Richiedi il Bonus Nido INPS per ${child.name}`,
            text: `In quanto genitore di un bambino sotto i 3 anni, puoi richiedere il Bonus Nido nazionale per rimborsare fino a € 272,72 al mese sulla retta.`,
            priority: 'money',
            icon: 'fa-solid fa-euro-sign',
            actionText: 'Vedi Agevolazioni Economiche',
            actionTab: 'tab-subsidies'
        });
    });
    
    kids36.forEach(child => {
        reminders.push({
            title: `Voucher Scuola dell'Infanzia per ${child.name}`,
            text: `È attivo il bando provinciale per il voucher di supporto alle rette per la Scuola Materna adatta a ${child.name} (${child.age} anni).`,
            priority: 'money',
            icon: 'fa-solid fa-wallet',
            actionText: 'Esplora Agevolazioni',
            actionTab: 'tab-subsidies'
        });
        
        reminders.push({
            title: `Laboratorio Didattico per ${child.name} questo Weekend!`,
            text: `C'è un'attività ideale per l'età di ${child.name} presso il MART o la Casa Depero. Verifica orari e disponibilità.`,
            priority: 'info',
            icon: 'fa-solid fa-puzzle-piece',
            actionText: 'Controlla gli Eventi',
            actionTab: 'tab-events'
        });
    });
    
    // 2. Family Structure analysis
    if (profile.children.length >= 2) {
        reminders.push({
            title: 'Riduzione Tariffe Plurifigli Attiva',
            text: `Rovereto prevede sconti cumulativi per fratelli/sorelle sulle mense e tariffe dei servizi all'infanzia (fino al 30% per il secondo figlio).`,
            priority: 'money',
            icon: 'fa-solid fa-people-roof',
            actionText: 'Leggi delibere agevolate',
            actionTab: 'tab-subsidies'
        });
    }
    
    // 3. Local neighborhood analysis
    if (profile.quartiere) {
        // Let's find schools in the same neighborhood
        const localSchools = state.data ? state.data.strutture_scolastiche.filter(s => s.quartiere.toLowerCase() === profile.quartiere.toLowerCase()) : [];
        if (localSchools.length > 0) {
            const places = localSchools.reduce((acc, s) => acc + s.posti_liberi, 0);
            reminders.push({
                title: `Servizi Scolastici a ${profile.quartiere}`,
                text: `Ci sono ${localSchools.length} strutture nel tuo quartiere con un totale di ${places} posti liberi.`,
                priority: 'local',
                icon: 'fa-solid fa-map-pin',
                actionText: 'Visualizza Mappa e Strutture',
                actionTab: 'tab-structures'
            });
        }
        
        reminders.push({
            title: `Miglioramento Parchi Giochi a ${profile.quartiere}`,
            text: `Il Comune ha stanziato fondi per l'installazione di nuovi giochi inclusivi per bambini 0-6 nelle aree verdi del quartiere ${profile.quartiere}.`,
            priority: 'local',
            icon: 'fa-solid fa-location-dot',
            actionText: 'Vedi novità delibere',
            actionTab: 'tab-news'
        });
    }
    
    // Render reminders list
    reminders.forEach(reminder => {
        const card = document.createElement('div');
        card.className = `reminder-card priority-${reminder.priority} speakable-card`;
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${reminder.title}. ${reminder.text}. Clicca per accedere alla scheda.`);
        
        card.innerHTML = `
            <div class="reminder-icon">
                <i class="${reminder.icon}"></i>
            </div>
            <div class="reminder-content">
                <h4>${reminder.title}</h4>
                <p>${reminder.text}</p>
                <button type="button" class="reminder-action-btn" tabindex="-1">
                    ${reminder.actionText} <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;
        
        // Trigger tab switch on click
        card.addEventListener('click', (e) => {
            if (state.voiceEnabled) {
                speakVoice(`${reminder.title}. ${reminder.text}`);
            }
            switchTab(reminder.actionTab);
        });
        
        // Accessibility Enter/Space trigger
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
        
        container.appendChild(card);
    });
}

// Update settings summary text helper
function updateSettingsSummary() {
    const summaryTextEl = document.getElementById('settingsSummaryText');
    if (!summaryTextEl) return;
    const themeName = state.theme === 'theme-light' ? 'Chiaro' : state.theme === 'theme-dark' ? 'Scuro' : 'Alto Contrasto';
    const voiceStatus = state.voiceEnabled ? 'Attiva' : 'Disattivata';
    summaryTextEl.innerHTML = `<i class="fa-solid fa-universal-access"></i> Accessibilità: Testo <strong>${Math.round(state.fontSizeScale * 100)}%</strong> • Tema <strong>${themeName}</strong> • Voce <strong>${voiceStatus}</strong>`;
}

// Set Font Size
function setFontSize(scale) {
    state.fontSizeScale = scale;
    document.documentElement.style.setProperty('--font-scale', scale);
    
    // Update slider control
    const slider = document.getElementById('sliderFontSize');
    if (slider) {
        slider.value = scale;
    }
    const valText = document.getElementById('fontSizeValText');
    if (valText) {
        valText.textContent = `${Math.round(scale * 100)}%`;
    }
    
    updateSettingsSummary();
    saveStateToLocalStorage();
}

// Set Theme
function setTheme(themeName) {
    state.theme = themeName;
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-contrast');
    document.body.classList.add(themeName);
    
    // Update theme selection cards visual feedback
    const cardLight = document.getElementById('themeCardLight');
    const cardDark = document.getElementById('themeCardDark');
    const cardContrast = document.getElementById('themeCardContrast');
    
    if (cardLight) cardLight.classList.toggle('active', themeName === 'theme-light');
    if (cardDark) cardDark.classList.toggle('active', themeName === 'theme-dark');
    if (cardContrast) cardContrast.classList.toggle('active', themeName === 'theme-contrast');
    
    // Update map style if initialized
    updateMapTileLayer();
    
    updateSettingsSummary();
    saveStateToLocalStorage();
}

// Update Map Tile Layer based on theme
function updateMapTileLayer() {
    if (state.map && state.mapTileLayer) {
        state.map.removeLayer(state.mapTileLayer);
        
        let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        let attribution = '&copy; OpenStreetMap &copy; CARTO';
        
        if (state.theme === 'theme-light') {
            tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        } else if (state.theme === 'theme-contrast') {
            tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
            attribution = '&copy; OpenStreetMap contributors';
        }
        
        state.mapTileLayer = L.tileLayer(tileUrl, {
            attribution: attribution,
            maxZoom: 20
        }).addTo(state.map);
    }
}

// Voice Assistant Click-to-Speak
function toggleVoiceAssistant() {
    state.voiceEnabled = !state.voiceEnabled;
    
    const btn = document.getElementById('btnVoiceToggle');
    if (btn) {
        const icon = btn.querySelector('i');
        const statusText = btn.querySelector('.voice-status-text');
        
        if (state.voiceEnabled) {
            btn.classList.add('active');
            if (icon) icon.className = 'fa-solid fa-volume-high';
            if (statusText) statusText.textContent = 'Attivato';
            document.body.classList.add('voice-active');
            speakVoice("Assistente vocale attivato. Fai clic su qualsiasi scheda per ascoltarla.");
        } else {
            btn.classList.remove('active');
            if (icon) icon.className = 'fa-solid fa-volume-xmark';
            if (statusText) statusText.textContent = 'Disattivato';
            document.body.classList.remove('voice-active');
            window.speechSynthesis.cancel();
            document.body.classList.remove('voice-speaking');
        }
    }
    
    updateSettingsSummary();
    saveStateToLocalStorage();
}

function speakVoice(text) {
    if (!state.voiceEnabled) return;
    
    window.speechSynthesis.cancel(); // Stop current speech
    document.body.classList.remove('voice-speaking');
    
    // Clean markdown characters from text for cleaner speech
    const cleanText = text.replace(/\*\*|__/g, '').replace(/\*|-/g, '').trim();
    if (!cleanText) return;
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'it-IT';
    
    // Apply voice settings from state
    utterance.rate = state.voiceRate;
    utterance.volume = state.voiceVolume;
    
    // Find selected or default Italian voice
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    if (state.selectedVoiceName) {
        selectedVoice = voices.find(v => v.name === state.selectedVoiceName);
    }
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('it'));
    }
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }
    
    utterance.onstart = () => {
        document.body.classList.add('voice-speaking');
    };
    
    utterance.onend = () => {
        document.body.classList.remove('voice-speaking');
    };
    
    utterance.onerror = () => {
        document.body.classList.remove('voice-speaking');
    };
    
    window.speechSynthesis.speak(utterance);
}

// Populate browser voices into selector
function populateVoices() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    const voices = window.speechSynthesis.getVoices();
    select.innerHTML = '<option value="">-- Voce di Sistema (Italiano) --</option>';
    voices.forEach(voice => {
        if (voice.lang.startsWith('it')) {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (state.selectedVoiceName === voice.name) {
                option.selected = true;
            }
            select.appendChild(option);
        }
    });
}

// Initialize Accessibility Button Event Listeners
function initAccessibilityEvents() {
    // Drawer panel toggle
    const btnToggleSettings = document.getElementById('btnToggleSettings');
    const settingsPanel = document.getElementById('settingsPanel');
    if (btnToggleSettings && settingsPanel) {
        btnToggleSettings.addEventListener('click', () => {
            const isVisible = settingsPanel.style.display !== 'none';
            if (isVisible) {
                settingsPanel.style.display = 'none';
                btnToggleSettings.classList.remove('active');
            } else {
                settingsPanel.style.display = 'block';
                btnToggleSettings.classList.add('active');
            }
        });
    }

    // Font size slider controls
    const sliderFontSize = document.getElementById('sliderFontSize');
    if (sliderFontSize) {
        sliderFontSize.addEventListener('input', (e) => {
            setFontSize(parseFloat(e.target.value));
        });
    }
    const btnResetFontSize = document.getElementById('btnResetFontSize');
    if (btnResetFontSize) {
        btnResetFontSize.addEventListener('click', () => {
            setFontSize(1.0);
        });
    }
    
    // Theme card selections
    const cardLight = document.getElementById('themeCardLight');
    const cardDark = document.getElementById('themeCardDark');
    const cardContrast = document.getElementById('themeCardContrast');
    
    if (cardLight) cardLight.addEventListener('click', () => setTheme('theme-light'));
    if (cardDark) cardDark.addEventListener('click', () => setTheme('theme-dark'));
    if (cardContrast) cardContrast.addEventListener('click', () => setTheme('theme-contrast'));
    
    // Voice Toggle
    const btnVoice = document.getElementById('btnVoiceToggle');
    if (btnVoice) btnVoice.addEventListener('click', () => toggleVoiceAssistant());
    
    // Auto-read checkbox
    const chkVoiceAutoRead = document.getElementById('chkVoiceAutoRead');
    if (chkVoiceAutoRead) {
        chkVoiceAutoRead.checked = state.voiceAutoRead;
        chkVoiceAutoRead.addEventListener('change', (e) => {
            state.voiceAutoRead = e.target.checked;
            saveStateToLocalStorage();
        });
    }
    
    // Browser Voice Select
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
        populateVoices();
    }
    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
        voiceSelect.addEventListener('change', (e) => {
            state.selectedVoiceName = e.target.value;
            saveStateToLocalStorage();
        });
    }
    
    // Voice synthesis parameters sliders
    const sliderVoiceRate = document.getElementById('sliderVoiceRate');
    const voiceRateVal = document.getElementById('voiceRateVal');
    if (sliderVoiceRate) {
        sliderVoiceRate.value = state.voiceRate;
        if (voiceRateVal) voiceRateVal.textContent = `${state.voiceRate.toFixed(1)}x`;
        sliderVoiceRate.addEventListener('input', (e) => {
            state.voiceRate = parseFloat(e.target.value);
            if (voiceRateVal) voiceRateVal.textContent = `${state.voiceRate.toFixed(1)}x`;
            saveStateToLocalStorage();
        });
    }
    
    const sliderVoiceVolume = document.getElementById('sliderVoiceVolume');
    const voiceVolumeVal = document.getElementById('voiceVolumeVal');
    if (sliderVoiceVolume) {
        sliderVoiceVolume.value = state.voiceVolume;
        if (voiceVolumeVal) voiceVolumeVal.textContent = `${Math.round(state.voiceVolume * 100)}%`;
        sliderVoiceVolume.addEventListener('input', (e) => {
            state.voiceVolume = parseFloat(e.target.value);
            if (voiceVolumeVal) voiceVolumeVal.textContent = `${Math.round(state.voiceVolume * 100)}%`;
            saveStateToLocalStorage();
        });
    }
}

// Dynamic Child Fields in Configurator
let childCount = 0;
function addChildRow(name = '', age = '') {
    const container = document.getElementById('children-list-container');
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'child-row';
    row.dataset.childIndex = childCount++;
    
    row.innerHTML = `
        <div class="child-avatar-col">
            <i class="fa-solid fa-child"></i>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <input type="text" class="child-name-input" placeholder="Nome del figlio" value="${name}" required aria-label="Nome del figlio">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <select class="child-age-select" required aria-label="Età del figlio">
                <option value="">-- Età --</option>
                <option value="0" ${age === '0' ? 'selected' : ''}>0 anni (Neonato)</option>
                <option value="1" ${age === '1' ? 'selected' : ''}>1 anno</option>
                <option value="2" ${age === '2' ? 'selected' : ''}>2 anni</option>
                <option value="3" ${age === '3' ? 'selected' : ''}>3 anni</option>
                <option value="4" ${age === '4' ? 'selected' : ''}>4 anni</option>
                <option value="5" ${age === '5' ? 'selected' : ''}>5 anni</option>
                <option value="6" ${age === '6' ? 'selected' : ''}>6 anni</option>
            </select>
        </div>
        <button type="button" class="btn-remove-child" title="Rimuovi figlio" aria-label="Rimuovi figlio">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
    
    // Bind remove button
    row.querySelector('.btn-remove-child').addEventListener('click', () => {
        row.classList.add('removing');
        row.addEventListener('animationend', () => {
            row.remove();
        });
    });
    
    // Dynamic avatar changes based on selected age
    const avatarCol = row.querySelector('.child-avatar-col');
    const ageSelect = row.querySelector('.child-age-select');
    
    function updateAvatar() {
        const selectedAge = ageSelect.value;
        avatarCol.className = 'child-avatar-col'; // Reset classes
        if (selectedAge === '') {
            avatarCol.innerHTML = '<i class="fa-solid fa-question"></i>';
        } else {
            const ageNum = parseInt(selectedAge);
            if (ageNum <= 1) {
                avatarCol.classList.add('avatar-baby');
                avatarCol.innerHTML = '<i class="fa-solid fa-baby"></i>';
            } else if (ageNum <= 3) {
                avatarCol.classList.add('avatar-toddler');
                avatarCol.innerHTML = '<i class="fa-solid fa-child-reaching"></i>';
            } else {
                avatarCol.classList.add('avatar-preschooler');
                avatarCol.innerHTML = '<i class="fa-solid fa-child"></i>';
            }
        }
    }
    
    ageSelect.addEventListener('change', updateAvatar);
    updateAvatar(); // initialize on load
    
    container.appendChild(row);
}

// Populate neighborhood dropdown
function populateNeighborhoods(quartieri) {
    const select = document.getElementById('setup-quartiere');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Seleziona il tuo quartiere --</option>';
    quartieri.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q;
        opt.textContent = q;
        select.appendChild(opt);
    });
}

// Neighborhood center coordinates for distance calculations
const QUARTIERI_COORDS = {
    "Centro Storico": [45.8912, 11.0410],
    "Borgo Sacco": [45.8845, 11.0320],
    "Brione": [45.8995, 11.0420],
    "Lizzana": [45.8780, 11.0320],
    "San Giorgio": [45.8910, 11.0520],
    "Noriglio": [45.8815, 11.0665],
    "Marco": [45.8580, 11.0250],
    "Lizzanella": [45.8850, 11.0450]
};

// Haversine formula for calculating distance in meters
function getHaversineDistance(coords1, coords2) {
    const [lat1, lon1] = coords1;
    const [lat2, lon2] = coords2;
    const R = 6371e3; // Earth's radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // distance in meters
}

// Render Dashboard Panel
function renderDashboard() {
    const profile = state.familyProfile;
    const centerCoord = QUARTIERI_COORDS[profile.quartiere] || [45.8912, 11.0410];
    
    // Format children details for summary
    const formatChildren = profile.children.map(c => `${c.name}: ${c.age} ${c.age === 1 ? 'anno' : 'anni'}`).join(', ');
    const summaryText = `Residente a ${profile.quartiere} • ${profile.children.length} ${profile.children.length === 1 ? 'figlio' : 'figli'} (${formatChildren})`;
    document.getElementById('dashboard-profile-summary').textContent = summaryText;
    
    // Determine age groups represented in profile
    const needsNido = profile.children.some(c => c.age >= 0 && c.age <= 3); // 0-3
    const needsMaterna = profile.children.some(c => c.age >= 3 && c.age <= 6); // 3-6
    
    // Render personalized alerts feed
    renderPersonalizedReminders();
    
    // Render 1. Strutture Vicine
    renderStrutture(profile.quartiere, needsNido, needsMaterna, centerCoord);
    
    // Render 2. Cosa Ti Spetta (Contributi)
    renderContributi(profile.children);
    
    // Render 3. Eventi per Famiglie
    renderEventi(profile.children);
    
    // Render 4. Novità dal Comune (Delibere)
    renderDelibere();
}

// 1. Render Strutture Vicine
function renderStrutture(quartiere, needsNido, needsMaterna, centerCoord) {
    const listContainer = document.getElementById('structures-list-container');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // Filter schools based on neighborhood and age requirements
    let filteredSchools = state.data.strutture_scolastiche.filter(school => {
        const matchesQuartiere = school.quartiere.toLowerCase() === quartiere.toLowerCase();
        let matchesAge = false;
        if (school.fascia_eta === "0-3" && needsNido) matchesAge = true;
        if (school.fascia_eta === "3-6" && needsMaterna) matchesAge = true;
        return matchesQuartiere && matchesAge;
    });
    
    if (filteredSchools.length === 0) {
        // Fallback: show schools from other neighborhoods that match age groups
        filteredSchools = state.data.strutture_scolastiche.filter(school => {
            let matchesAge = false;
            if (school.fascia_eta === "0-3" && needsNido) matchesAge = true;
            if (school.fascia_eta === "3-6" && needsMaterna) matchesAge = true;
            return matchesAge;
        });
        
        listContainer.innerHTML = `
            <div class="info-alert" style="background: rgba(255, 71, 164, 0.08); border: 1px solid rgba(255, 71, 164, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.85rem; color: var(--accent-pink);">
                <i class="fa-solid fa-circle-info"></i> Nessuna struttura specifica registrata per il quartiere <strong>${quartiere}</strong>. Ecco le strutture più vicine nel Comune di Rovereto:
            </div>
        `;
    }
    
    // Calculate distance and sort
    filteredSchools.forEach(school => {
        school.distance = getHaversineDistance(centerCoord, school.coordinate);
    });
    filteredSchools.sort((a, b) => a.distance - b.distance);
    
    // Render school cards
    filteredSchools.forEach(school => {
        const card = document.createElement('div');
        card.className = 'school-card speakable-card';
        
        const distText = school.distance < 1000 
            ? `${Math.round(school.distance)}m da te` 
            : `${(school.distance / 1000).toFixed(1)} km da te`;
            
        // Link a Google Maps (preferito) o OpenStreetMap come fallback
        const mapUrl = school.link_mappa || school.link_osm || '';
        const phoneHref = school.telefono ? `tel:${String(school.telefono).replace(/[^0-9+]/g, '')}` : '';
        const mapLink = mapUrl
            ? `<a href="${mapUrl}" target="_blank" rel="noopener" class="news-source-link"><i class="fa-solid fa-map-location-dot"></i> Apri in Google Maps</a>`
            : '';

        card.innerHTML = `
            <span class="dist-badge"><i class="fa-solid fa-location-arrow"></i> ${distText}</span>
            <h4>${school.nome}</h4>
            <div class="school-meta">
                <span><i class="fa-solid fa-tag"></i> ${school.tipo}</span>
                <span><i class="fa-solid fa-map-pin"></i> ${school.indirizzo}</span>
                <span><i class="fa-solid fa-phone"></i> ${phoneHref ? `<a href="${phoneHref}" style="color:inherit;text-decoration:none;">${school.telefono}</a>` : school.telefono}</span>
            </div>
            <div class="school-services">
                <span class="service-tag" style="border-color: var(--accent-pink); color: var(--accent-pink); font-weight: 600;">
                    <i class="fa-solid fa-chair"></i> Posti Liberi: ${school.posti_liberi}
                </span>
                ${school.servizi.map(s => `<span class="service-tag"><i class="fa-solid fa-check"></i> ${s}</span>`).join('')}
            </div>
            ${mapLink}
        `;

        // Click action: speak text & center map on this school
        card.addEventListener('click', (e) => {
            if (e.target.closest('.service-tag') || e.target.closest('.dist-badge') || e.target.closest('a')) return;
            
            if (state.voiceEnabled) {
                const speechText = `Scuola ${school.nome}, ${school.tipo}. Situata in ${school.indirizzo}. ${school.posti_liberi} posti liberi. Distanza ${Math.round(school.distance)} metri.`;
                speakVoice(speechText);
            }
            
            if (state.map && school.marker) {
                state.map.setView(school.coordinate, 16);
                school.marker.openPopup();
            }
        });
        
        listContainer.appendChild(card);
    });
    
    // Update Map Markers
    updateDashboardMap(filteredSchools, centerCoord);
}

// Update Map
function updateDashboardMap(schools, centerCoord) {
    if (!state.map) {
        state.map = L.map('dashboard-map').setView(centerCoord, 14);
        state.mapMarkersGroup = L.layerGroup().addTo(state.map);
    } else {
        state.map.setView(centerCoord, 14);
        state.mapMarkersGroup.clearLayers();
    }
    
    // Tile Layer setup
    let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap &copy; CARTO';
    
    if (state.theme === 'theme-light') {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    } else if (state.theme === 'theme-contrast') {
        tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
    
    if (state.mapTileLayer) {
        state.map.removeLayer(state.mapTileLayer);
    }
    
    state.mapTileLayer = L.tileLayer(tileUrl, {
        attribution: attribution,
        maxZoom: 20
    }).addTo(state.map);
    
    // HTML Icons
    const createHtmlIcon = (iconClass, colorClass) => L.divIcon({
        html: `<div class="marker-pin-custom ${colorClass}"><i class="${iconClass}"></i></div>`,
        className: 'custom-leaflet-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });
    
    // Add User location marker
    L.marker(centerCoord, { icon: createHtmlIcon('fa-solid fa-house-user', 'bg-purple') })
        .bindPopup(`<strong>La Tua Casa</strong><br>Mock location nel quartiere ${state.familyProfile.quartiere}`)
        .addTo(state.mapMarkersGroup);
        
    // Add School markers
    schools.forEach(school => {
        const marker = L.marker(school.coordinate, { icon: createHtmlIcon('fa-solid fa-school', 'bg-pink') })
            .bindPopup(`
                <div class="map-popup">
                    <strong style="color:var(--accent-pink);font-size:1rem;">${school.nome}</strong><br>
                    <span style="font-size:0.82rem;color:var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${school.indirizzo}</span><br>
                    <div class="divider" style="margin:8px 0;"></div>
                    <strong>Posti Liberi:</strong> <span style="color:var(--accent-green);font-weight:700;">${school.posti_liberi}</span><br>
                    <strong>Telefono:</strong> ${school.telefono}
                </div>
            `)
            .addTo(state.mapMarkersGroup);
            
        school.marker = marker;
    });
    
    // Force Leaflet sizing correction
    setTimeout(() => {
        state.map.invalidateSize();
    }, 200);
}

// 2. Render Cosa Ti Spetta (Contributi)
function renderContributi(children) {
    const container = document.getElementById('subsidies-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter contributions based on child requirements
    const filteredSubsidies = state.data.contributi_famiglie.filter(sub => {
        // Requisito figli count
        if (children.length < sub.requisito_figli) {
            return false;
        }
        
        // Fascia eta range check
        const [minAge, maxAge] = sub.fascia_eta.split('-').map(Number);
        const hasEligibleChild = children.some(c => c.age >= minAge && c.age <= maxAge);
        return hasEligibleChild;
    });
    
    if (filteredSubsidies.length === 0) {
        container.innerHTML = `
            <div class="info-alert" style="padding: 16px; border-radius: 8px; font-size: 0.9rem; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-circle-info"></i> Nessun contributo specifico trovato per il tuo profilo familiare.
            </div>
        `;
        return;
    }
    
    filteredSubsidies.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subsidy-card speakable-card';

        const fonte = sub.fonte || 'Comune di Rovereto';
        const linkUfficiale = sub.link_ufficiale
            ? `<a href="${sub.link_ufficiale}" target="_blank" rel="noopener" class="news-source-link"><i class="fa-solid fa-up-right-from-square"></i> Vai alla pagina ufficiale (${fonte})</a>`
            : '';

        card.innerHTML = `
            <div class="subsidy-header">
                <h4>${sub.nome}</h4>
                <span class="subsidy-amount">${sub.importo_massimo}</span>
            </div>
            <div class="simplified-ai-box">
                <div class="ai-box-header">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Spiegazione Semplice AI
                </div>
                <p>${sub.spiegazione_semplice_ai}</p>
                ${linkUfficiale}
            </div>
            <div class="legalese-disclosure">
                <button type="button" class="legalese-btn">
                    <i class="fa-solid fa-chevron-down"></i> Mostra testo ufficiale (delibera)
                </button>
                <div class="legalese-content">
                    <strong>Estratto Ufficiale Burocratico:</strong><br>
                    <p style="margin-top: 4px; font-style: italic;">${sub.estratto_ufficiale}</p>
                </div>
            </div>
        `;

        // Voice click handler
        card.addEventListener('click', (e) => {
            if (e.target.closest('.legalese-btn') || e.target.closest('a')) return;

            if (state.voiceEnabled) {
                speakVoice(`Agevolazione ${sub.nome}. Spiegazione AI: ${sub.spiegazione_semplice_ai}`);
            }
        });
        
        // Accordion functionality
        const btn = card.querySelector('.legalese-btn');
        const content = card.querySelector('.legalese-content');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = content.classList.contains('active');
            if (isActive) {
                content.classList.remove('active');
                btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Mostra testo ufficiale (delibera)';
            } else {
                content.classList.add('active');
                btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Nascondi testo ufficiale';
            }
        });
        
        container.appendChild(card);
    });
}

// 3. Render Eventi per Famiglie
function renderEventi(children) {
    const container = document.getElementById('events-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter events
    const filteredEvents = state.data.eventi_famiglie.filter(ev => {
        return children.some(c => c.age >= ev.eta_min && c.age <= ev.eta_max);
    });
    
    if (filteredEvents.length === 0) {
        container.innerHTML = `
            <div class="info-alert" style="padding: 16px; border-radius: 8px; font-size: 0.9rem; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-circle-info"></i> Nessun evento in programma adatto all'età dei tuoi figli.
            </div>
        `;
        return;
    }
    
    filteredEvents.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'event-card speakable-card';
        
        // Build child compatibility tags
        const compatibilityTags = [];
        children.forEach((child, childIdx) => {
            if (child.age >= ev.eta_min && child.age <= ev.eta_max) {
                const colorClass = `tag-child-${childIdx % 4}`;
                compatibilityTags.push(`
                    <span class="child-eligibility-tag ${colorClass}">
                        <i class="fa-solid fa-child"></i> Adatto per ${child.name} (${child.age} ${child.age === 1 ? 'anno' : 'anni'})
                    </span>
                `);
            }
        });
        
        const fonteLabel = ev.fonte || 'Sito ufficiale';
        const sourceLink = ev.link_ufficiale
            ? `<a href="${ev.link_ufficiale}" target="_blank" rel="noopener" class="news-source-link"><i class="fa-solid fa-up-right-from-square"></i> ${fonteLabel}</a>`
            : '';

        card.innerHTML = `
            <div class="sec-title-row">
                <h4>${ev.titolo}</h4>
                <div class="eligibility-tags">
                    ${compatibilityTags.join('')}
                </div>
            </div>
            <p class="event-museum"><i class="fa-solid fa-building-columns"></i> ${ev.museo}</p>
            <p class="event-desc-text">${ev.descrizione}</p>
            <div class="event-footer">
                <div class="event-info-group">
                    <span><i class="fa-regular fa-calendar"></i> ${ev.data}</span>
                    <span style="margin-left: 12px;"><i class="fa-solid fa-ticket"></i> ${ev.prezzo}</span>
                </div>
                <span><i class="fa-solid fa-baby"></i> Fascia d'età: ${ev.eta_min}-${ev.eta_max} anni</span>
            </div>
            ${sourceLink}
        `;

        // Click handler: speak + focus event coordinates on Leaflet map
        card.addEventListener('click', (e) => {
            if (e.target.closest('.child-eligibility-tag') || e.target.closest('.event-footer') || e.target.closest('a')) return;
            
            if (state.voiceEnabled) {
                speakVoice(`Attività ${ev.titolo} presso ${ev.museo}. Descrizione: ${ev.descrizione}`);
            }
            
            if (state.map) {
                state.map.setView(ev.coordinate, 16);
                L.popup()
                    .setLatLng(ev.coordinate)
                    .setContent(`<strong>${ev.titolo}</strong><br><span style="font-size:0.8rem;color:var(--text-muted);">${ev.museo}</span>`)
                    .openOn(state.map);
            }
        });
        
        container.appendChild(card);
    });
}

// News Classification & Relevance Helpers
function classifyNews(news) {
    const text = (news.oggetto_ufficiale + " " + news.sintesi_ai.join(" ")).toLowerCase();
    if (text.includes("nidi") || text.includes("asili") || text.includes("scuola") || text.includes("ammissione") || text.includes("scolastiche")) {
        return "scuole";
    }
    if (text.includes("stradali") || text.includes("traffico") || text.includes("sicurezza stradale") || text.includes("veicolare")) {
        return "mobilita";
    }
    if (text.includes("parchi") || text.includes("aree gioco") || text.includes("ludiche") || text.includes("altalene") || text.includes("giardini")) {
        return "aree-verdi";
    }
    if (text.includes("welfare") || text.includes("tariffe") || text.includes("agevolazioni") || text.includes("isee") || text.includes("contributi")) {
        return "welfare";
    }
    return "altro";
}

function checkNewsRelevance(news) {
    const profile = state.familyProfile;
    const badges = [];
    let relevant = false;
    
    if (!profile || !profile.children) return { relevant, badges };
    
    if (news.delibera.includes("45/2026")) {
        const hasChild03 = profile.children.some(c => c.age >= 0 && c.age <= 3);
        if (hasChild03) {
            relevant = true;
            badges.push("Per te");
            badges.push("Fascia 0-3");
        }
    }
    
    if (news.delibera.includes("12/2026")) {
        const isSacco = profile.quartiere && profile.quartiere.toLowerCase() === "borgo sacco";
        const hasChild06 = profile.children.some(c => c.age >= 0 && c.age <= 6);
        if (isSacco || hasChild06) {
            relevant = true;
            if (isSacco) badges.push("Per Borgo Sacco");
            else badges.push("Per te");
        }
    }
    
    if (news.delibera.includes("88/2026")) {
        const qL = profile.quartiere ? profile.quartiere.toLowerCase() : "";
        const matchesNeighborhood = qL === "brione" || qL === "lizzana" || qL === "borgo sacco";
        if (matchesNeighborhood) {
            relevant = true;
            badges.push(`Per ${profile.quartiere}`);
            badges.push("Parchi Gioco");
        }
    }
    
    if (news.delibera.includes("31/2026")) {
        const isLargeFamily = profile.children.length >= 2;
        if (isLargeFamily) {
            relevant = true;
            badges.push("Famiglie Numerose");
            badges.push("Welfare");
        }
    }

    // News LIVE dal Comune: matching su categoria + profilo
    if (news.live) {
        const cat = news.categoria;
        const hasChild03 = profile.children.some(c => c.age >= 0 && c.age <= 3);
        const hasChild06 = profile.children.length > 0;
        if (cat === 'scuole' && hasChild06) {
            relevant = true; badges.push("Per te"); badges.push("Scuole");
        } else if (cat === 'welfare' && hasChild06) {
            relevant = true; badges.push("Welfare");
        } else if (cat === 'aree-verdi' && hasChild06) {
            relevant = true; badges.push("Parchi");
        } else if (cat === 'mobilita' && profile.quartiere) {
            relevant = true; badges.push("Mobilità");
        }
    }

    return { relevant, badges };
}

// 4. Render Novità dal Comune (Delibere)
function renderDelibere() {
    const container = document.getElementById('news-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!state.data || !state.data.novita_comune) return;
    
    const filteredNews = state.data.novita_comune.filter(news => {
        // 1. Relevance filter tab
        const relData = checkNewsRelevance(news);
        if (state.newsFilterRelevance === 'for-me' && !relData.relevant) {
            return false;
        }
        
        // 2. Category filter pill
        const category = classifyNews(news);
        if (state.newsFilterCategory !== 'all' && category !== state.newsFilterCategory) {
            return false;
        }
        
        return true;
    });
    
    if (filteredNews.length === 0) {
        container.innerHTML = `
            <div class="info-alert" style="grid-column: 1 / -1; padding: 16px; border-radius: 8px; font-size: 0.9rem; text-align: center; color: var(--text-secondary); width: 100%;">
                <i class="fa-solid fa-circle-info"></i> Nessuna novità trovata per questa selezione.
            </div>
        `;
        return;
    }
    
    filteredNews.forEach(news => {
        const card = document.createElement('div');
        card.className = 'news-card speakable-card';

        // Prefer category set by the backend, fallback to client-side classifier
        const category = news.categoria || classifyNews(news);
        const relData = checkNewsRelevance(news);

        // Category color-coded badge label
        let catLabel = '';
        if (category === 'scuole') catLabel = `<span class="news-category-label cat-scuole"><i class="fa-solid fa-school"></i> Scuole</span>`;
        else if (category === 'mobilita') catLabel = `<span class="news-category-label cat-mobilita"><i class="fa-solid fa-car-side"></i> Mobilità</span>`;
        else if (category === 'aree-verdi') catLabel = `<span class="news-category-label cat-aree-verdi"><i class="fa-solid fa-tree"></i> Parchi</span>`;
        else if (category === 'welfare') catLabel = `<span class="news-category-label cat-welfare"><i class="fa-solid fa-hand-holding-dollar"></i> Welfare</span>`;

        // Badge LIVE per le novità scrapeate in tempo reale dal sito del Comune
        const liveBadge = news.live
            ? `<span class="badge-match" style="background:linear-gradient(90deg,#22c55e,#0ea5e9);color:#fff;border:0;"><i class="fa-solid fa-bolt"></i> LIVE</span>`
            : '';

        const badgesHtml = relData.badges.map(b => `<span class="badge-match">${b}</span>`).join(' ');

        // Sintesi AI sicura (alcuni item live potrebbero avere meno di 2 punti)
        const s0 = (news.sintesi_ai && news.sintesi_ai[0]) || news.oggetto_ufficiale || '';
        const s1 = (news.sintesi_ai && news.sintesi_ai[1]) || 'Consulta il sito ufficiale del Comune di Rovereto per i dettagli.';

        // Link al sito ufficiale (solo per news live)
        const sourceLink = news.link
            ? `<a href="${news.link}" target="_blank" rel="noopener" class="news-source-link"><i class="fa-solid fa-up-right-from-square"></i> Leggi sul sito ufficiale</a>`
            : '';

        card.innerHTML = `
            <div>
                <div class="news-header">
                    <span class="num">${news.delibera}</span>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap: wrap;">
                        ${liveBadge}
                        ${catLabel}
                        ${badgesHtml}
                        <span><i class="fa-regular fa-calendar-days"></i> ${news.data}</span>
                    </div>
                </div>
                <h4>${news.oggetto_ufficiale}</h4>
            </div>
            <div class="ai-summary-box mt-3">
                <div class="ai-summary-header">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Sintesi AI (2 righe)
                </div>
                <ul class="ai-summary-list">
                    <li>${s0}</li>
                    <li>${s1}</li>
                </ul>
                ${sourceLink}
            </div>
        `;
        
        // Voice click handler
        card.addEventListener('click', (e) => {
            if (e.target.closest('.ai-summary-box') || e.target.closest('a')) return;

            if (state.voiceEnabled) {
                const speechText = `${news.delibera} del ${news.data}. Oggetto: ${news.oggetto_ufficiale}. Sintesi: ${s0} ${s1}`;
                speakVoice(speechText);
            }
        });
        
        container.appendChild(card);
    });
}

// Reset AI Advisor to customized welcome message
function resetAiAdvisor() {
    const history = document.getElementById('ai-chat-history');
    if (!history) return;
    
    // Reset conversation memory
    state.chatHistory = [];
    state.lastTopic = null;
    state.lastChildContext = null;
    
    const profile = state.familyProfile;
    const kidsText = profile.children.map(c => `${c.name} (${c.age} ${c.age === 1 ? 'anno' : 'anni'})`).join(', ');
    
    history.innerHTML = `
        <div class="ai-message ai-message-system speakable-card">
            <div class="message-icon"><i class="fa-solid fa-robot"></i></div>
            <div class="message-text">
                <p>Ciao! Sono l'<strong>Assistente AI di RoverFamily</strong>. Ho caricato i dati di Rovereto per il tuo profilo:</p>
                <p>📍 Residente a <strong>${profile.quartiere}</strong><br>👶 <strong>${profile.children.length}</strong> figli: <em>${kidsText}</em></p>
                <p>Come posso aiutarti? Clicca su uno dei suggerimenti o fammi una domanda sul welfare o sulle scuole.</p>
            </div>
        </div>
    `;
    
    // Add Click to speak
    const msgCard = history.querySelector('.ai-message');
    const msgText = msgCard.querySelector('.message-text');
    msgCard.addEventListener('click', () => {
        if (state.voiceEnabled) {
            speakVoice(msgText.textContent);
        }
    });
}

// Word-by-word HTML-safe typing effect
function typeMessageStream(element, htmlContent, scrollContainer, onComplete) {
    element.innerHTML = '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const queue = [];
    
    function traverse(node, currentParent) {
        if (node.nodeType === Node.TEXT_NODE) {
            const words = node.textContent.split(/(\s+)/);
            words.forEach(w => {
                if (w) queue.push({ type: 'text', content: w, parent: currentParent });
            });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const newElement = document.createElement(node.tagName);
            for (let attr of node.attributes) {
                newElement.setAttribute(attr.name, attr.value);
            }
            queue.push({ type: 'element_start', element: newElement, parent: currentParent });
            node.childNodes.forEach(child => traverse(child, newElement));
            queue.push({ type: 'element_end', element: newElement, parent: currentParent });
        }
    }
    
    tempDiv.childNodes.forEach(child => traverse(child, null));
    
    let index = 0;
    const activeElements = new Map();
    activeElements.set(null, element);
    
    function processNext() {
        if (index >= queue.length) {
            if (onComplete) onComplete();
            return;
        }
        
        const item = queue[index++];
        if (item.type === 'text') {
            const parentElement = activeElements.get(item.parent);
            parentElement.appendChild(document.createTextNode(item.content));
        } else if (item.type === 'element_start') {
            const parentElement = activeElements.get(item.parent);
            const cloned = item.element.cloneNode(false);
            parentElement.appendChild(cloned);
            activeElements.set(item.element, cloned);
        } else if (item.type === 'element_end') {
            // Closed element
        }
        
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        
        setTimeout(processNext, 20); // 20ms per token
    }
    
    processNext();
}

// Handle query and update chat panel
function handleAiQuery(queryText) {
    const history = document.getElementById('ai-chat-history');
    if (!history) return;
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-message ai-message-user';
    userMsg.innerHTML = `
        <div class="message-icon"><i class="fa-solid fa-user"></i></div>
        <div class="message-text"><p>${escapeHtml(queryText)}</p></div>
    `;
    history.appendChild(userMsg);
    history.scrollTop = history.scrollHeight;
    
    // Add typing message
    const typingMsg = document.createElement('div');
    typingMsg.className = 'ai-message ai-message-system';
    typingMsg.innerHTML = `
        <div class="message-icon"><i class="fa-solid fa-robot"></i></div>
        <div class="message-text">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    history.appendChild(typingMsg);
    history.scrollTop = history.scrollHeight;
    
    // Record user message in memory
    state.chatHistory.push({ role: 'user', text: queryText });
    
    // Generate AI content html
    const responseHtml = computeAiResponse(queryText);
    
    // Record AI response in memory
    state.chatHistory.push({ role: 'assistant', text: responseHtml, topic: state.lastTopic, childContext: state.lastChildContext });
    
    // Persist updated chat history and AI state
    saveStateToLocalStorage();
    
    setTimeout(() => {
        const textContainer = typingMsg.querySelector('.message-text');
        typingMsg.classList.add('speakable-card');
        
        typeMessageStream(textContainer, responseHtml, history, () => {
            typingMsg.addEventListener('click', () => {
                if (state.voiceEnabled) {
                    speakVoice(textContainer.textContent);
                }
            });
            if (state.voiceAutoRead && state.voiceEnabled) {
                speakVoice(textContainer.textContent);
            }
        });
    }, 1200);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// AI Advisor response engine
function computeAiResponse(queryText) {
    if (!state.data) {
        return `<p>I dati non sono ancora pronti. Riprova tra un attimo.</p>`;
    }
    
    const q = queryText.toLowerCase();
    const profile = state.familyProfile;
    const centerCoord = QUARTIERI_COORDS[profile.quartiere] || [45.8912, 11.0410];
    
    // 1. Resolve child context
    let childContext = null;
    let childContextName = "";
    
    for (let child of profile.children) {
        if (q.includes(child.name.toLowerCase())) {
            childContext = child;
            childContextName = child.name;
            break;
        }
    }
    
    if (!childContext && (q.includes('grande') || q.includes('maggiore') || q.includes('primo') || q.includes('vecchio') || q.includes('più grande'))) {
        if (profile.children.length > 0) {
            const sorted = [...profile.children].sort((a, b) => b.age - a.age);
            childContext = sorted[0];
            childContextName = childContext.name;
        }
    }
    
    if (!childContext && (q.includes('piccolo') || q.includes('minore') || q.includes('neonato') || q.includes('secondo') || q.includes('ultimo') || q.includes('neonata') || q.includes('più piccolo'))) {
        if (profile.children.length > 0) {
            const sorted = [...profile.children].sort((a, b) => a.age - b.age);
            childContext = sorted[0];
            childContextName = childContext.name;
        }
    }
    
    if (!childContext && (q.includes('altro') || q.includes('altra') || q.includes('secondo')) && profile.children.length === 2) {
        if (state.lastChildContext) {
            const other = profile.children.find(c => c.name.toLowerCase() !== state.lastChildContext.toLowerCase());
            if (other) {
                childContext = other;
                childContextName = other.name;
            }
        }
    }
    
    if (childContext) {
        state.lastChildContext = childContextName;
    }
    
    // 2. Resolve topic
    let topic = null;
    if (q.includes('asili') || q.includes('asilo') || q.includes('scuola') || q.includes('scuole') || q.includes('posti') || q.includes('nido') || q.includes('nidi') || q.includes('materne') || q.includes('materna') || q.includes('infanzia')) {
        topic = 'schools';
    } else if (q.includes('bonus') || q.includes('contributi') || q.includes('contributo') || q.includes('spetta') || q.includes('soldi') || q.includes('agevolazioni') || q.includes('agevolazione') || q.includes('isee') || q.includes('card') || q.includes('sussidi') || q.includes('sussidio') || q.includes('voucher') || q.includes('economici')) {
        topic = 'subsidies';
    } else if (q.includes('evento') || q.includes('eventi') || q.includes('weekend') || q.includes('fine settimana') || q.includes('fare') || q.includes('attività') || q.includes('mart') || q.includes('museo') || q.includes('musei') || q.includes('laboratorio') || q.includes('laboratori') || q.includes('domenica') || q.includes('sabato')) {
        topic = 'events';
    } else if (q.includes('delibere') || q.includes('delibera') || q.includes('novità') || q.includes('comune') || q.includes('atti') || q.includes('regolamento') || q.includes('deliberazioni')) {
        topic = 'news';
    }
    
    // Inherit topic if follow-up
    if (!topic && state.lastTopic) {
        const isFollowUp = childContextName || 
                           q.includes('richiedere') || q.includes('richiede') || q.includes('domanda') || q.includes('procedura') || q.includes('ottenere') || q.includes('ottengo') || q.includes('fare') || 
                           q.includes('costo') || q.includes('costa') || q.includes('prezzo') || q.includes('gratis') || q.includes('pagare') || q.includes('tariffe') || q.includes('sconti') || 
                           q.includes('quando') || q.includes('orari') || q.includes('apertura') || q.includes('dove') || q.includes('indirizzo') || q.includes('telefono') || q.includes('contatti') ||
                           q.includes('iscrizione') || q.includes('iscrivere') || q.includes('bando');
        if (isFollowUp) {
            topic = state.lastTopic;
        }
    }
    
    if (topic) {
        state.lastTopic = topic;
    }
    
    // 3. Generate response based on topic & childContext
    if (topic === 'schools') {
        // Option: enrollment detail
        if (q.includes('iscrizione') || q.includes('iscrivere') || q.includes('bando') || q.includes('come') || q.includes('documenti')) {
            return `
                <p>📝 <strong>Procedura di Iscrizione Scuole a Rovereto:</strong></p>
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                    <li><strong>Nidi d'infanzia (0-3 anni):</strong> Le domande si presentano online sul portale del Comune di Rovereto dal 1° al 30 giugno. È necessario avere SPID/CIE e l'attestazione ISEE.</li>
                    <li><strong>Scuole dell'infanzia (3-6 anni):</strong> Le iscrizioni sono gestite a livello provinciale e avvengono di norma nel mese di gennaio per l'anno scolastico successivo.</li>
                </ul>
                <p>Tariffe e precedenze in graduatoria sono regolate in base al punteggio del nucleo familiare e all'ISEE.</p>
            `;
        }
        
        if (childContext) {
            const needsNido = childContext.age >= 0 && childContext.age <= 3;
            const rangeText = needsNido ? "nido d'infanzia (0-3 anni)" : "scuola dell'infanzia (3-6 anni)";
            
            let matches = state.data.strutture_scolastiche.filter(school => {
                const matchesQuartiere = school.quartiere.toLowerCase() === profile.quartiere.toLowerCase();
                let matchesAge = false;
                if (school.fascia_eta === "0-3" && needsNido) matchesAge = true;
                if (school.fascia_eta === "3-6" && !needsNido) matchesAge = true;
                return matchesQuartiere && matchesAge;
            });
            
            let prefix = "";
            if (matches.length === 0) {
                matches = state.data.strutture_scolastiche.filter(school => {
                    let matchesAge = false;
                    if (school.fascia_eta === "0-3" && needsNido) matchesAge = true;
                    if (school.fascia_eta === "3-6" && !needsNido) matchesAge = true;
                    return matchesAge;
                });
                prefix = `<p>⚠️ Per <strong>${childContext.name}</strong> (${childContext.age} anni - richiede ${rangeText}), non ci sono strutture specifiche registrate a <strong>${profile.quartiere}</strong>. Ecco le più vicine nel Comune di Rovereto:</p>`;
            } else {
                prefix = `<p>🏫 Ecco le strutture adatte per <strong>${childContext.name}</strong> (${childContext.age} anni - richiede ${rangeText}) nel quartiere <strong>${profile.quartiere}</strong>:</p>`;
            }
            
            matches.forEach(s => {
                s.distance = getHaversineDistance(centerCoord, s.coordinate);
            });
            matches.sort((a, b) => a.distance - b.distance);
            
            const schoolList = matches.slice(0, 3).map(s => {
                const dist = s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance / 1000).toFixed(1)} km`;
                return `<li>🏫 <strong>${s.nome}</strong>: dista <strong>${dist}</strong> da te, posti liberi: <span style="color:var(--accent-green);font-weight:bold;">${s.posti_liberi}</span> (Tel: ${s.telefono})</li>`;
            }).join('');
            
            return `
                ${prefix}
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                    ${schoolList}
                </ul>
                <p>💡 <em>Consiglio AI:</em> Il bando d'iscrizione comunale per l'anno scolastico 2026/2027 sarà attivo dal 1° al 30 giugno.</p>
            `;
        } else {
            // General school response
            const needsNido = profile.children.some(c => c.age >= 0 && c.age <= 3);
            const needsMaterna = profile.children.some(c => c.age >= 3 && c.age <= 6);
            
            let matches = state.data.strutture_scolastiche.filter(school => {
                const matchesQuartiere = school.quartiere.toLowerCase() === profile.quartiere.toLowerCase();
                let matchesAge = false;
                if (school.fascia_eta === "0-3" && needsNido) matchesAge = true;
                if (school.fascia_eta === "3-6" && needsMaterna) matchesAge = true;
                return matchesQuartiere && matchesAge;
            });
            
            let prefix = "";
            if (matches.length === 0) {
                matches = state.data.strutture_scolastiche.filter(school => {
                    let matchesAge = false;
                    if (school.fascia_eta === "0-3" && needsNido) matchesAge = true;
                    if (school.fascia_eta === "3-6" && needsMaterna) matchesAge = true;
                    return matchesAge;
                });
                prefix = `<p>⚠️ Non ci sono asili o materne specifici registrati a <strong>${profile.quartiere}</strong> per l'età dei tuoi figli. Ecco i più vicini nel Comune di Rovereto:</p>`;
            } else {
                prefix = `<p>✅ Ecco gli asili e le scuole dell'infanzia disponibili a <strong>${profile.quartiere}</strong>:</p>`;
            }
            
            matches.forEach(s => {
                s.distance = getHaversineDistance(centerCoord, s.coordinate);
            });
            matches.sort((a, b) => a.distance - b.distance);
            
            const schoolList = matches.slice(0, 3).map(s => {
                const dist = s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance / 1000).toFixed(1)} km`;
                return `<li>🏫 <strong>${s.nome}</strong> (${s.tipo}): dista <strong>${dist} da te</strong>, posti liberi: <span style="color:var(--accent-green);font-weight:bold;">${s.posti_liberi}</span> (Tel: ${s.telefono})</li>`;
            }).join('');
            
            return `
                ${prefix}
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                    ${schoolList}
                </ul>
                <p>💡 <em>Consiglio AI:</em> Il bando d'iscrizione comunale per l'anno scolastico 2026/2027 sarà attivo dal 1° al 30 giugno.</p>
            `;
        }
    }
    
    if (topic === 'subsidies') {
        if (q.includes('richiedere') || q.includes('richiede') || q.includes('domanda') || q.includes('procedura') || q.includes('ottenere') || q.includes('ottengo') || q.includes('come') || q.includes('isee')) {
            return `
                <p>📋 <strong>Come richiedere i contributi a Rovereto:</strong></p>
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                    <li><strong>Presentazione domanda:</strong> La maggior parte dei contributi (es. Bonus Nido, Voucher) richiede la presentazione online tramite il portale dei servizi del Comune con SPID o CIE.</li>
                    <li><strong>Requisito ISEE:</strong> È essenziale possedere un'attestazione ISEE valida per l'anno in corso. Molte agevolazioni sono riservate a nuclei con ISEE inferiore a determinate soglie.</li>
                    <li><strong>Rovereto Family Card:</strong> Rilasciata gratuitamente dal Comune per le famiglie residenti, dà diritto a riduzioni su musei e tariffe.</li>
                </ul>
                <p>Puoi contattare lo Sportello Sociale del Comune al numero <strong>0464 452111</strong> per assistenza gratuita.</p>
            `;
        }
        
        if (childContext) {
            const filteredSubsidies = state.data.contributi_famiglie.filter(sub => {
                const [minAge, maxAge] = sub.fascia_eta.split('-').map(Number);
                return childContext.age >= minAge && childContext.age <= maxAge;
            });
            
            if (filteredSubsidies.length === 0) {
                return `<p>Dall'analisi dell'età non risultano sussidi comunali specifici attivi per <strong>${childContext.name}</strong> (${childContext.age} anni). Verifica sul sito del Comune per eventuali bandi straordinari.</p>`;
            }
            
            const subsidiesList = filteredSubsidies.map(sub => {
                return `<li>💵 <strong>${sub.nome}</strong> (fino a <strong>${sub.importo_massimo}</strong>): <br><span style="font-size:0.85rem;color:var(--text-secondary);">${sub.spiegazione_semplice_ai}</span></li>`;
            }).join('');
            
            return `
                <p>✅ Ecco le agevolazioni e i contributi applicabili per <strong>${childContext.name}</strong> (${childContext.age} anni):</p>
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:8px;">
                    ${subsidiesList}
                </ul>
                <p>💡 <em>Consiglio AI:</em> Puoi scaricare le domande o chiedere supporto gratuito per l'ISEE presso i CAF convenzionati di Rovereto.</p>
            `;
        } else {
            // General subsidies response
            const filteredSubsidies = state.data.contributi_famiglie.filter(sub => {
                if (profile.children.length < sub.requisito_figli) return false;
                const [minAge, maxAge] = sub.fascia_eta.split('-').map(Number);
                return profile.children.some(c => c.age >= minAge && c.age <= maxAge);
            });
            
            if (filteredSubsidies.length === 0) {
                return `<p>Dall'analisi del tuo profilo non risultano sussidi comunali specifici attivi. Contatta le Politiche Sociali (0464 452111) per verifiche sul tuo ISEE.</p>`;
            }
            
            const subsidiesList = filteredSubsidies.map(sub => {
                return `<li>💵 <strong>${sub.nome}</strong> (fino a <strong>${sub.importo_massimo}</strong>): <br><span style="font-size:0.85rem;color:var(--text-secondary);">${sub.spiegazione_semplice_ai}</span></li>`;
            }).join('');
            
            return `
                <p>✅ Ecco le agevolazioni e i contributi calcolati per il tuo profilo familiare:</p>
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:8px;">
                    ${subsidiesList}
                </ul>
                <p>💡 <em>Consiglio AI:</em> Puoi scaricare le domande o chiedere supporto gratuito per l'ISEE presso i CAF convenzionati di Rovereto.</p>
            `;
        }
    }
    
    if (topic === 'events') {
        if (q.includes('costa') || q.includes('costo') || q.includes('prezzo') || q.includes('gratis') || q.includes('sconti') || q.includes('sconto')) {
            return `
                <p>🎫 <strong>Costi e Sconti Laboratori Culturali:</strong></p>
                <p>I laboratori didattici e gli eventi organizzati nei musei di Rovereto (Mart, Casa Depero, Museo di Scienze) hanno costi molto accessibili per le famiglie (solitamente dai 3 € ai 5 € a bambino).</p>
                <p>🎁 <strong>Rovereto Family Card:</strong> Mostrando la card all'ingresso, potrai beneficiare di tariffe agevolate, ingressi gratuiti per i bambini e riduzioni per gli adulti.</p>
            `;
        }
        
        if (childContext) {
            const filteredEvents = state.data.eventi_famiglie.filter(ev => {
                return childContext.age >= ev.eta_min && childContext.age <= ev.eta_max;
            });
            
            if (filteredEvents.length === 0) {
                return `<p>Nessun evento didattico specifico in programma per l'età di <strong>${childContext.name}</strong> (${childContext.age} anni). Consulta il sito dell'Azienda per il Turismo per maggiori attività.</p>`;
            }
            
            const eventsList = filteredEvents.map(ev => {
                return `<li>🎨 <strong>${ev.titolo}</strong> presso <em>${ev.museo}</em> (${ev.data}): adatto per l'età di ${childContext.name}. Prezzo: ${ev.prezzo}.</li>`;
            }).join('');
            
            return `
                <p>✅ Ecco gli eventi didattici e i laboratori adatti per <strong>${childContext.name}</strong> (${childContext.age} anni):</p>
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                    ${eventsList}
                </ul>
                <p>💡 <em>Consiglio AI:</em> Con la Rovereto Family Card l'ingresso è gratuito o scontato nei musei della città.</p>
            `;
        } else {
            // General events response
            const filteredEvents = state.data.eventi_famiglie.filter(ev => {
                return profile.children.some(c => c.age >= ev.eta_min && c.age <= ev.eta_max);
            });
            
            if (filteredEvents.length === 0) {
                return `<p>Nessun evento culturale in programma nel weekend adatto per l'età dei tuoi figli. Ti consigliamo le aree giochi all'aperto nei parchi di Rovereto.</p>`;
            }
            
            const eventsList = filteredEvents.map(ev => {
                const childrenEligible = profile.children
                    .filter(c => c.age >= ev.eta_min && c.age <= ev.eta_max)
                    .map(c => c.name)
                    .join(' e ');
                return `<li>🎨 <strong>${ev.titolo}</strong> presso <em>${ev.museo}</em> (${ev.data}): ideale per <strong>${childrenEligible}</strong>. Biglietto: ${ev.prezzo}.</li>`;
            }).join('');
            
            return `
                <p>✅ Ecco gli eventi didattici e i laboratori adatti per i tuoi figli:</p>
                <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                    ${eventsList}
                </ul>
                <p>💡 <em>Consiglio AI:</em> Con la Rovereto Family Card l'ingresso è gratuito o scontato nei musei della città.</p>
            `;
        }
    }
    
    if (topic === 'news') {
        const newsList = state.data.novita_comune.map(news => {
            return `<li>📜 <strong>${news.delibera}</strong>: <em>${news.sintesi_ai[0]}</em> (Data: ${news.data})</li>`;
        }).join('');
        
        return `
            <p>✅ Ecco le ultime delibere comunali riassunte per le famiglie:</p>
            <ul style="padding-left:16px; margin: 8px 0; display:flex; flex-direction:column; gap:6px;">
                ${newsList}
            </ul>
            <p>💡 <em>Consiglio AI:</em> Guarda la sezione "Novità dal Comune" nella dashboard per leggere i dettagli sintetizzati in 2 righe.</p>
        `;
    }
    
    // Default fallback - show what we know about the profile and prompt options
    const kidsText = profile.children.map(c => `<strong>${c.name}</strong> (${c.age} ${c.age === 1 ? 'anno' : 'anni'})`).join(' e ');
    return `
        <p>Ciao! Sono l'<strong>Assistente AI di RoverFamily</strong>. Ho in memoria la tua residenza a <strong>${profile.quartiere}</strong> e i bambini ${kidsText}.</p>
        <p>Non ho capito bene la tua domanda, ma puoi chiedermi informazioni specifiche tipo:</p>
        <ul style="padding-left:16px; margin: 6px 0; display:flex; flex-direction:column; gap:4px;">
            <li>"Quali asili nido ci sono per <strong>${profile.children[0]?.name || 'i bambini'}</strong>?"</li>
            <li>"Quali bonus o contributi spettano a <strong>${profile.children[1]?.name || 'Sofia'}</strong>?"</li>
            <li>"Consigliami un laboratorio o evento per il più piccolo"</li>
            <li>"Come si presentano le domande di iscrizione o i bonus?"</li>
        </ul>
        <p>Risponderò in tempo reale estraendo i dati aperti del Comune di Rovereto.</p>
    `;
}

// Bind input and chip triggers
function initAiAdvisorEvents() {
    const form = document.getElementById('ai-advisor-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('ai-advisor-input');
            const val = input.value.trim();
            if (val) {
                handleAiQuery(val);
                input.value = '';
            }
        });
    }
    
    const chipsContainer = document.getElementById('ai-chips-container');
    if (chipsContainer) {
        chipsContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.ai-chip');
            if (chip) {
                const prompt = chip.dataset.prompt;
                if (prompt) {
                    handleAiQuery(prompt);
                }
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// QUICK PREVIEW - pagina pubblica senza login
// ═══════════════════════════════════════════════════════════════════
function populateQuickPreviewQuartieri(quartieri) {
    const sel = document.getElementById('qp-quartiere');
    if (!sel || !quartieri) return;
    sel.innerHTML = '<option value="">-- Scegli --</option>';
    quartieri.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q; opt.textContent = q;
        sel.appendChild(opt);
    });
}

function parseAgesInput(raw) {
    if (!raw) return [];
    return raw.split(/[,;.\s]+/)
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
}

function computePreviewStats(quartiere, ages) {
    if (!state.data || !ages.length) return null;
    const qL = (quartiere || '').toLowerCase();
    const centerCoord = QUARTIERI_COORDS[quartiere] || [45.8912, 11.0410];

    // Scuole/asili nel quartiere o entro 1.5 km
    const needsNido = ages.some(a => a >= 0 && a <= 3);
    const needsMaterna = ages.some(a => a >= 3 && a <= 6);
    const allSchools = state.data.strutture_scolastiche || [];
    const matchingSchools = allSchools.filter(s => {
        const okAge = (s.fascia_eta === '0-3' && needsNido) || (s.fascia_eta === '3-6' && needsMaterna);
        if (!okAge) return false;
        if (s.quartiere && s.quartiere.toLowerCase() === qL) return true;
        const d = getHaversineDistance(centerCoord, s.coordinate || [0,0]);
        return d <= 1500;
    });

    // Sussidi compatibili (basta che almeno un figlio rientri nella fascia)
    const allSubs = state.data.contributi_famiglie || [];
    const matchingSubs = allSubs.filter(sub => {
        if (ages.length < (sub.requisito_figli || 1)) return false;
        const [mn, mx] = (sub.fascia_eta || '0-6').split('-').map(Number);
        return ages.some(a => a >= mn && a <= mx);
    });

    // Eventi
    const allEvents = state.data.eventi_famiglie || [];
    const matchingEvents = allEvents.filter(ev => ages.some(a => a >= ev.eta_min && a <= ev.eta_max));

    // News rilevanti
    const allNews = state.data.novita_comune || [];
    const liveNewsRelevant = allNews.filter(n => {
        if (!n.live) return false;
        const cat = n.categoria;
        if (cat === 'scuole' || cat === 'welfare' || cat === 'aree-verdi') return true;
        if (cat === 'mobilita' && qL) return true;
        return false;
    });

    return {
        schools: matchingSchools,
        subs: matchingSubs,
        events: matchingEvents,
        news: liveNewsRelevant,
    };
}

function renderPreviewResult(quartiere, ages, stats) {
    const el = document.getElementById('qp-result');
    if (!el) return;
    if (!stats) {
        el.innerHTML = `<p style="color:var(--accent-rose);">Dati non ancora caricati, riprova tra un istante.</p>`;
        el.style.display = 'block';
        return;
    }

    const kidsLabel = ages.length === 1
        ? `1 figlio di ${ages[0]} ${ages[0] === 1 ? 'anno' : 'anni'}`
        : `${ages.length} figli (${ages.join(', ')} anni)`;

    const sorted = stats.schools.slice().sort((a,b) => {
        const da = getHaversineDistance(QUARTIERI_COORDS[quartiere] || [45.8912,11.0410], a.coordinate || [0,0]);
        const db = getHaversineDistance(QUARTIERI_COORDS[quartiere] || [45.8912,11.0410], b.coordinate || [0,0]);
        return da - db;
    });
    const topSchools = sorted.slice(0, 2).map(s => s.nome).join(' • ');
    const topSubs = stats.subs.slice(0, 2).map(s => s.nome).join(' • ');

    el.innerHTML = `
        <div class="qp-result-headline">
            Una famiglia a <strong>${quartiere}</strong> con ${kidsLabel} può accedere a:
        </div>

        <div class="qp-stats-grid">
            <div class="qp-stat">
                <div class="qp-stat-icon violet"><i class="fa-solid fa-school"></i></div>
                <div class="qp-stat-value">${stats.schools.length}</div>
                <div class="qp-stat-label">${stats.schools.length === 1 ? 'Struttura vicina' : 'Strutture vicine'}</div>
            </div>
            <div class="qp-stat">
                <div class="qp-stat-icon rose"><i class="fa-solid fa-euro-sign"></i></div>
                <div class="qp-stat-value">${stats.subs.length}</div>
                <div class="qp-stat-label">${stats.subs.length === 1 ? 'Bonus disponibile' : 'Bonus disponibili'}</div>
            </div>
            <div class="qp-stat">
                <div class="qp-stat-icon cyan"><i class="fa-solid fa-calendar-days"></i></div>
                <div class="qp-stat-value">${stats.events.length}</div>
                <div class="qp-stat-label">${stats.events.length === 1 ? 'Evento adatto' : 'Eventi adatti'}</div>
            </div>
            <div class="qp-stat">
                <div class="qp-stat-icon emerald"><i class="fa-solid fa-newspaper"></i></div>
                <div class="qp-stat-value">${stats.news.length}</div>
                <div class="qp-stat-label">Novità rilevanti</div>
            </div>
        </div>

        ${topSchools ? `<div class="qp-highlights"><i class="fa-solid fa-location-dot"></i> <strong>Strutture più vicine:</strong> ${topSchools}</div>` : ''}
        ${topSubs ? `<div class="qp-highlights"><i class="fa-solid fa-hand-holding-dollar"></i> <strong>Esempi di bonus:</strong> ${topSubs}</div>` : ''}

        <div class="qp-cta-row">
            <button type="button" class="btn btn-violet btn-large" id="qp-go-spid">
                <i class="fa-solid fa-shield-halved"></i> Accedi con SPID per i dettagli
            </button>
            <button type="button" class="btn btn-ghost btn-large" id="qp-go-guest">
                <i class="fa-solid fa-user-secret"></i> Continua come ospite
            </button>
        </div>
        <div class="qp-hint-bottom">
            Le distanze in metri, i recapiti telefonici e la mappa interattiva sono disponibili dopo l'accesso.
        </div>
    `;
    el.style.display = 'block';

    // Pre-popola il setup con i dati della preview
    document.getElementById('qp-go-spid').addEventListener('click', () => {
        document.getElementById('btnLandingLogin').click();
    });
    document.getElementById('qp-go-guest').addEventListener('click', () => {
        // Carica preview nello state, poi va al setup
        state.familyProfile = {
            quartiere,
            children: ages.map((a, i) => ({ name: `Figlio ${i+1}`, age: a }))
        };
        const sel = document.getElementById('setup-quartiere');
        if (sel) sel.value = quartiere;
        const cont = document.getElementById('children-list-container');
        if (cont) {
            cont.innerHTML = '';
            ages.forEach((a, i) => addChildRow(`Figlio ${i+1}`, String(a)));
        }
        showPanel('panel-setup');
    });

    // Scroll alla preview
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function initQuickPreviewForm() {
    const form = document.getElementById('qp-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const quartiere = document.getElementById('qp-quartiere').value;
        const agesRaw = document.getElementById('qp-ages').value;
        const ages = parseAgesInput(agesRaw);
        if (!quartiere) { alert('Seleziona il quartiere'); return; }
        if (!ages.length) { alert('Inserisci almeno un\'età valida (0-6 anni). Es: 1, 4'); return; }
        const stats = computePreviewStats(quartiere, ages);
        renderPreviewResult(quartiere, ages, stats);
    });
}

// ── Deep link via URL params (QR code / IO / partner) ──────────
const SOURCE_LABELS = {
    'io':           { icon: 'fa-mobile-screen-button', text: 'Sei arrivato da <strong>App IO</strong> — il portale ufficiale per la tua famiglia ti aspetta.' },
    'consultorio':  { icon: 'fa-heart-pulse',          text: 'Sei arrivato dal <strong>consultorio familiare</strong>: scopri subito i servizi del Comune per te.' },
    'pediatra':     { icon: 'fa-stethoscope',          text: 'Suggerito dal tuo <strong>pediatra</strong> — tutti i servizi 0-6 anni della tua famiglia, in un click.' },
    'asilo':        { icon: 'fa-school',               text: 'Sei arrivato da un <strong>asilo convenzionato</strong>: vedi bonus, agevolazioni e iscrizioni.' },
    'biblioteca':   { icon: 'fa-book',                 text: 'Sei arrivato dalla <strong>Biblioteca Civica</strong> — laboratori, eventi e servizi per le famiglie.' },
    'comune':       { icon: 'fa-landmark',             text: 'Stai arrivando dal sito del <strong>Comune di Rovereto</strong>.' },
    'anagrafe':     { icon: 'fa-people-roof',          text: 'Hai registrato una nascita: scopri tutti i servizi e bonus che il Comune mette a disposizione.' },
};

function initFromUrlParams() {
    const p = new URLSearchParams(window.location.search);
    const from = (p.get('from') || '').toLowerCase();
    const q = p.get('q') || p.get('quartiere');
    const kidsStr = p.get('kids') || p.get('eta');

    // Mostra banner se arrivi da un canale partner
    if (from && SOURCE_LABELS[from]) {
        const banner = document.getElementById('source-banner');
        const txt = document.getElementById('source-banner-text');
        if (banner && txt) {
            txt.innerHTML = SOURCE_LABELS[from].text;
            banner.querySelector('i').className = 'fa-solid ' + SOURCE_LABELS[from].icon;
            banner.style.display = 'flex';
        }
    }

    // Pre-popola la preview (riprova finché il select ha le opzioni)
    if (q || kidsStr) {
        let attempts = 0;
        const tryFill = () => {
            attempts++;
            const sel = document.getElementById('qp-quartiere');
            const inp = document.getElementById('qp-ages');
            if (!sel || !inp) return false;
            // Il select dev'essere già popolato con le opzioni dei quartieri
            const hasOptions = sel.options.length > 1;
            if (q) {
                if (!hasOptions) return false;
                const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
                const target = norm(q);
                const match = Array.from(sel.options).find(o => norm(o.value) === target);
                if (!match) {
                    // Match parziale (es. "borgo" → "Borgo Sacco")
                    const partial = Array.from(sel.options).find(o => norm(o.value).includes(target) || target.includes(norm(o.value)));
                    if (partial) sel.value = partial.value;
                } else {
                    sel.value = match.value;
                }
                // Trigger change event per altri listeners
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (kidsStr) {
                // Accetta sia virgola che punto come separatore
                const clean = kidsStr.replace(/[^0-9,;.\s]/g, '').replace(/\./g, ',');
                inp.value = clean;
            }
            return true;
        };
        // Riprova ogni 200ms fino a 10 tentativi (2 sec max)
        const tryInterval = setInterval(() => {
            if (tryFill() || attempts >= 10) {
                clearInterval(tryInterval);
                // Auto-submit dopo che il fill è andato a buon fine
                if (q && kidsStr) {
                    setTimeout(() => {
                        const form = document.getElementById('qp-form');
                        if (form) form.requestSubmit();
                    }, 300);
                }
            }
        }, 200);
        tryFill(); // prova anche subito
    }
}

// ─── Main App Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initQuickPreviewForm();
    initClock();
    initAccessibilityEvents();
    initAiAdvisorEvents();
    initTabs();

    // ── Restore saved state ──────────────────────────────────────
    const hasSavedState = loadStateFromLocalStorage();
    if (hasSavedState) {
        setFontSize(state.fontSizeScale);
        setTheme(state.theme);
        const btnVoice = document.getElementById('btnVoiceToggle');
        if (btnVoice) {
            const icon = btnVoice.querySelector('i');
            const statusText = btnVoice.querySelector('.voice-status-text');
            if (state.voiceEnabled) {
                btnVoice.classList.add('active');
                if (icon) icon.className = 'fa-solid fa-volume-high';
                if (statusText) statusText.textContent = 'Attivato';
                document.body.classList.add('voice-active');
            }
        }
    } else {
        setFontSize(1.0);
        setTheme('theme-dark');
    }

    // ── DOM references ───────────────────────────────────────────
    const authModal      = document.getElementById('auth-modal');
    const spidIdpSel     = document.getElementById('spid-idp-selector');
    const spidLoginForm  = document.getElementById('spid-login-form');
    const cieLoginForm   = document.getElementById('cie-login-form');
    const spidTitle      = document.getElementById('spid-provider-title');
    const spidStatusBadge= document.getElementById('spid-status-badge');
    const setupTitleEl   = document.getElementById('setup-title');
    const setupSubtitleEl= document.getElementById('setup-subtitle');

    const formSpidCred   = document.getElementById('form-spid-credentials');
    const formCieCred    = document.getElementById('form-cie-credentials');

    // ── Restore current user ─────────────────────────────────────
    state.currentUser = getCurrentUser();
    updateUserPill();

    // ── Load Open Data: prima prova l'API live, fallback a data.json ─
    async function loadAppData() {
        try {
            const r = await fetch('/api/data', { cache: 'no-store' });
            if (!r.ok) throw new Error('API HTTP ' + r.status);
            const d = await r.json();
            console.log('[RoverFamily] Dati LIVE dal backend:', d._meta);
            return d;
        } catch (e) {
            console.warn('[RoverFamily] API non disponibile, uso data.json statico:', e.message);
            const r2 = await fetch('data.json');
            return await r2.json();
        }
    }
    try {
        state.data = await loadAppData();
        populateNeighborhoods(state.data.quartieri);
        populateQuickPreviewQuartieri(state.data.quartieri);
    } catch (error) {
        console.error('Failed to load app data:', error);
    }

    // ── URL parameters: deep link da QR / IO / partner ────────────
    initFromUrlParams();

    // ── Prefill children list ────────────────────────────────────
    const childrenContainer = document.getElementById('children-list-container');
    if (childrenContainer) childrenContainer.innerHTML = '';
    if (hasSavedState && state.familyProfile && state.familyProfile.children && state.familyProfile.children.length > 0) {
        state.familyProfile.children.forEach(c => addChildRow(c.name, String(c.age)));
    } else {
        addChildRow('Luca', '1');
        addChildRow('Sofia', '4');
    }

    // ── Initial routing ──────────────────────────────────────────
    const hasProfile = state.familyProfile && state.familyProfile.quartiere && state.familyProfile.children && state.familyProfile.children.length > 0;

    if (hasProfile) {
        // Already configured → go straight to dashboard
        const selectEl = document.getElementById('setup-quartiere');
        if (selectEl) selectEl.value = state.familyProfile.quartiere;
        showPanel('panel-dashboard');
        renderDashboard();
        restoreChatHistoryUI();
    } else {
        // No profile → show landing page
        showPanel('panel-landing');
    }

    // ═══════════════════════════════════════════════════
    // LANDING PAGE BUTTONS
    // ═══════════════════════════════════════════════════
    const btnLandingLogin = document.getElementById('btnLandingLogin');
    if (btnLandingLogin) {
        btnLandingLogin.addEventListener('click', () => showPanel('panel-auth'));
    }

    const btnLandingGuest = document.getElementById('btnLandingGuest');
    if (btnLandingGuest) {
        btnLandingGuest.addEventListener('click', () => {
            state.isSpidLoggedIn = false;
            setCurrentUser(null);
            prepareSetupPanel(false);
            showPanel('panel-setup');
        });
    }

    // Header logo → back to landing
    const logoHome = document.getElementById('logoHome');
    if (logoHome) {
        logoHome.addEventListener('click', () => {
            if (document.getElementById('panel-dashboard').style.display === 'block') return; // stay on dash
            showPanel('panel-landing');
        });
    }

    // Header login button (shown when logged out)
    const btnHeaderLogin = document.getElementById('btnHeaderLogin');
    if (btnHeaderLogin) {
        btnHeaderLogin.addEventListener('click', () => showPanel('panel-auth'));
    }

    // ═══════════════════════════════════════════════════
    // AUTH PAGE BUTTONS
    // ═══════════════════════════════════════════════════
    const btnAuthBackToHome = document.getElementById('btnAuthBackToHome');
    if (btnAuthBackToHome) {
        btnAuthBackToHome.addEventListener('click', () => showPanel('panel-landing'));
    }

    // Tab switcher: Accedi / Registrati
    const authTabBtns = document.querySelectorAll('.auth-tab-btn');
    authTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            authTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.auth-form-pane').forEach(pane => {
                pane.style.display = pane.id === target ? 'block' : 'none';
            });
        });
    });

    // Switch links inside forms
    const switchToReg = document.getElementById('switchToRegister');
    if (switchToReg) {
        switchToReg.addEventListener('click', () => {
            document.getElementById('authTabRegister').click();
        });
    }
    const switchToLog = document.getElementById('switchToLogin');
    if (switchToLog) {
        switchToLog.addEventListener('click', () => {
            document.getElementById('authTabLogin').click();
        });
    }

    // Guest from login form
    const btnGuestFromLogin = document.getElementById('btnGuestFromLogin');
    if (btnGuestFromLogin) {
        btnGuestFromLogin.addEventListener('click', () => {
            state.isSpidLoggedIn = false;
            setCurrentUser(null);
            prepareSetupPanel(false);
            showPanel('panel-setup');
        });
    }

    // ── LOGIN FORM SUBMIT ────────────────────────────────────────
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', (e) => {
            e.preventDefault();
            const email    = document.getElementById('login-email').value.trim().toLowerCase();
            const password = document.getElementById('login-password').value;
            const errEl    = document.getElementById('login-error');

            const users = getUsers();
            const user  = users.find(u => u.email === email && u.password === password);
            if (!user) {
                errEl.textContent = 'Email o password non corretti. Prova di nuovo o registrati.';
                errEl.style.display = 'block';
                return;
            }
            errEl.style.display = 'none';
            setCurrentUser({ name: user.name, email: user.email });

            // Load family profile from account if present
            if (user.anprProfile && MOCK_SPID_PROFILES[user.anprProfile]) {
                state.familyProfile = JSON.parse(JSON.stringify(MOCK_SPID_PROFILES[user.anprProfile]));
                state.isSpidLoggedIn = false;
            } else if (user.familyProfile) {
                state.familyProfile = user.familyProfile;
            }

            if (state.familyProfile && state.familyProfile.quartiere) {
                const sel = document.getElementById('setup-quartiere');
                if (sel) sel.value = state.familyProfile.quartiere;
                syncChildrenUI();
                saveStateToLocalStorage();
                showPanel('panel-dashboard');
                renderDashboard();
                resetAiAdvisor();
            } else {
                prepareSetupPanel(false);
                showPanel('panel-setup');
            }
        });
    }

    // ── REGISTER FORM SUBMIT ─────────────────────────────────────
    const formRegister = document.getElementById('form-register');
    if (formRegister) {
        formRegister.addEventListener('submit', (e) => {
            e.preventDefault();
            const name      = document.getElementById('reg-name').value.trim();
            const email     = document.getElementById('reg-email').value.trim().toLowerCase();
            const password  = document.getElementById('reg-password').value;
            const password2 = document.getElementById('reg-password2').value;
            const anprKey   = document.getElementById('reg-anpr-profile').value;
            const errEl     = document.getElementById('register-error');
            const sucEl     = document.getElementById('register-success');

            errEl.style.display = 'none';
            sucEl.style.display = 'none';

            if (!name || !email || !password) {
                errEl.textContent = 'Compila tutti i campi obbligatori.';
                errEl.style.display = 'block'; return;
            }
            if (password.length < 8) {
                errEl.textContent = 'La password deve essere di almeno 8 caratteri.';
                errEl.style.display = 'block'; return;
            }
            if (password !== password2) {
                errEl.textContent = 'Le password non corrispondono.';
                errEl.style.display = 'block'; return;
            }

            const users = getUsers();
            if (users.find(u => u.email === email)) {
                errEl.textContent = 'Questa email è già registrata. Accedi invece.';
                errEl.style.display = 'block'; return;
            }

            const newUser = { name, email, password, anprProfile: anprKey || null };
            users.push(newUser);
            saveUsers(users);
            setCurrentUser({ name, email });

            // If ANPR profile selected, load it
            if (anprKey && MOCK_SPID_PROFILES[anprKey]) {
                state.familyProfile = JSON.parse(JSON.stringify(MOCK_SPID_PROFILES[anprKey]));
                state.isSpidLoggedIn = false;
                sucEl.textContent = `Account creato! Profilo famiglia caricato automaticamente.`;
                sucEl.style.display = 'block';

                setTimeout(() => {
                    const sel = document.getElementById('setup-quartiere');
                    if (sel) sel.value = state.familyProfile.quartiere;
                    syncChildrenUI();
                    startAnprSyncing(anprKey);
                }, 800);
            } else {
                sucEl.textContent = 'Account creato con successo! Configura ora il tuo profilo.';
                sucEl.style.display = 'block';
                setTimeout(() => {
                    prepareSetupPanel(false);
                    showPanel('panel-setup');
                }, 1000);
            }
        });
    }

    // ═══════════════════════════════════════════════════
    // SPID / CIE BUTTONS (Auth page + Login page)
    // ═══════════════════════════════════════════════════
    function openSpidModal() {
        if (authModal) authModal.style.display = 'flex';
        if (spidIdpSel)    spidIdpSel.style.display = 'block';
        if (spidLoginForm) spidLoginForm.style.display = 'none';
        if (cieLoginForm)  cieLoginForm.style.display = 'none';
    }
    function openCieModal() {
        if (authModal) authModal.style.display = 'flex';
        if (spidIdpSel)    spidIdpSel.style.display = 'none';
        if (spidLoginForm) spidLoginForm.style.display = 'none';
        if (cieLoginForm)  cieLoginForm.style.display = 'block';
    }

    ['btn-login-spid', 'btn-register-spid'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', openSpidModal);
    });
    ['btn-login-cie', 'btn-register-cie'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', openCieModal);
    });

    // IDP grid buttons
    document.querySelectorAll('.idp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.dataset.idp;
            if (spidTitle) {
                spidTitle.innerHTML = `<span class="spid-logo-small">spid</span> Entra con ${provider}`;
            }
            if (spidIdpSel)    spidIdpSel.style.display = 'none';
            if (spidLoginForm) spidLoginForm.style.display = 'block';
        });
    });

    // Close auth modal
    const btnCloseAuthModal = document.getElementById('btn-close-auth-modal');
    if (btnCloseAuthModal) {
        btnCloseAuthModal.addEventListener('click', () => {
            if (authModal) authModal.style.display = 'none';
        });
    }

    // SPID credentials form submit
    if (formSpidCred) {
        formSpidCred.addEventListener('submit', (e) => {
            e.preventDefault();
            const profileKey = document.getElementById('spid-test-profile').value;
            const spidUser = { name: profileKey.charAt(0).toUpperCase() + profileKey.slice(1) + ' (SPID)', email: `${profileKey}@spid.it` };
            setCurrentUser(spidUser);
            state.isSpidLoggedIn = true;
            startAnprSyncing(profileKey);
        });
    }

    // CIE credentials form submit
    if (formCieCred) {
        formCieCred.addEventListener('submit', (e) => {
            e.preventDefault();
            const profileKey = document.getElementById('cie-test-profile').value;
            const cieUser = { name: profileKey.charAt(0).toUpperCase() + profileKey.slice(1) + ' (CIE)', email: `${profileKey}@cie.it` };
            setCurrentUser(cieUser);
            state.isSpidLoggedIn = true;
            startAnprSyncing(profileKey);
        });
    }

    // ═══════════════════════════════════════════════════
    // SETUP PANEL
    // ═══════════════════════════════════════════════════
    function prepareSetupPanel(isModal) {
        const setupTitle2   = document.getElementById('setup-title');
        const setupSubtitle2= document.getElementById('setup-subtitle');
        const badge         = document.getElementById('spid-status-badge');
        const closeBtn      = document.getElementById('btn-close-setup-modal');
        const cancelBtn     = document.getElementById('btn-cancel-setup');
        const panelSetup    = document.getElementById('panel-setup');

        if (badge) badge.style.display = state.isSpidLoggedIn ? 'inline-flex' : 'none';
        if (setupTitle2) setupTitle2.textContent = isModal
            ? (state.isSpidLoggedIn ? 'Modifica Profilo Sincronizzato' : 'Modifica Profilo Ospite')
            : 'Configura il Profilo della Tua Famiglia';
        if (setupSubtitle2) setupSubtitle2.textContent = isModal
            ? "Modifica il quartiere di residenza e l'età dei figli per aggiornare la dashboard."
            : "Inserisci il quartiere di residenza e l'età dei tuoi figli (0-6 anni).";

        if (closeBtn) closeBtn.style.display = isModal ? 'flex' : 'none';
        if (cancelBtn) cancelBtn.style.display = isModal ? 'inline-flex' : 'none';

        if (isModal) {
            if (panelSetup) { panelSetup.classList.add('modal-mode'); panelSetup.style.display = 'flex'; }
        } else {
            if (panelSetup) panelSetup.classList.remove('modal-mode');
        }
    }

    function syncChildrenUI() {
        const cont = document.getElementById('children-list-container');
        if (!cont) return;
        cont.innerHTML = '';
        if (state.familyProfile && state.familyProfile.children && state.familyProfile.children.length > 0) {
            state.familyProfile.children.forEach(c => addChildRow(c.name, String(c.age)));
        } else {
            addChildRow('Luca', '1');
        }
    }

    // Add child row button
    const btnAddChild = document.getElementById('btn-add-child');
    if (btnAddChild) btnAddChild.addEventListener('click', () => addChildRow());

    // Modify profile (from dashboard)
    const btnModifyProfile = document.getElementById('btn-modify-profile');
    if (btnModifyProfile) {
        btnModifyProfile.addEventListener('click', () => {
            const sel = document.getElementById('setup-quartiere');
            if (sel) sel.value = state.familyProfile.quartiere;
            syncChildrenUI();
            prepareSetupPanel(true);
        });
    }

    // Cancel / close profile modal
    const btnCloseSetup = document.getElementById('btn-close-setup-modal');
    if (btnCloseSetup) btnCloseSetup.addEventListener('click', () => {
        const panelSetup = document.getElementById('panel-setup');
        if (panelSetup) { panelSetup.classList.remove('modal-mode'); panelSetup.style.display = 'none'; }
        showPanel('panel-dashboard');
    });

    const btnCancelSetup = document.getElementById('btn-cancel-setup');
    if (btnCancelSetup) btnCancelSetup.addEventListener('click', () => {
        const panelSetup = document.getElementById('panel-setup');
        if (panelSetup && panelSetup.classList.contains('modal-mode')) {
            panelSetup.classList.remove('modal-mode');
            panelSetup.style.display = 'none';
            showPanel('panel-dashboard');
        } else {
            showPanel('panel-landing');
        }
    });

    // Setup form submit (manual)
    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
        setupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const quartiere = document.getElementById('setup-quartiere').value;
            const childRows = document.querySelectorAll('.child-row');
            const children  = [];

            childRows.forEach(row => {
                const nameInput = row.querySelector('.child-name-input');
                const ageSelect = row.querySelector('.child-age-select');
                if (nameInput && ageSelect && nameInput.value.trim() && ageSelect.value !== '') {
                    children.push({ name: nameInput.value.trim(), age: parseInt(ageSelect.value) });
                }
            });

            if (children.length === 0) {
                alert('Inserisci almeno un figlio con nome ed età validi.');
                return;
            }

            state.familyProfile = { quartiere, children };
            // Save profile into user account if logged in
            if (state.currentUser) {
                const users = getUsers();
                const idx = users.findIndex(u => u.email === state.currentUser.email);
                if (idx !== -1) { users[idx].familyProfile = state.familyProfile; saveUsers(users); }
            }

            const panelSetup = document.getElementById('panel-setup');
            if (panelSetup) { panelSetup.classList.remove('modal-mode'); panelSetup.style.display = 'none'; }

            showPanel('panel-dashboard');
            renderDashboard();
            resetAiAdvisor();
            saveStateToLocalStorage();
        });
    }

    // ═══════════════════════════════════════════════════
    // ANPR SYNC ANIMATION
    // ═══════════════════════════════════════════════════
    function startAnprSyncing(profileKey) {
        if (authModal) authModal.style.display = 'none';
        const overlay = document.getElementById('login-loading-overlay');
        if (!overlay) return;

        ['step-auth','step-anpr','step-family','step-dashboard'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.className = 'sync-step pending';
                el.querySelector('.step-icon').innerHTML = '<i class="fa-regular fa-circle"></i>';
            }
        });
        overlay.style.display = 'flex';

        const stepSeq = [
            { id: 'step-auth', delay: 500 },
            { id: 'step-anpr', delay: 800 },
            { id: 'step-family', delay: 800 },
            { id: 'step-dashboard', delay: 800 },
        ];

        let elapsed = 0;
        stepSeq.forEach((step, i) => {
            elapsed += step.delay;
            setTimeout(() => {
                // mark current as spinning
                const el = document.getElementById(step.id);
                if (el) { el.className = 'sync-step'; el.querySelector('.step-icon').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

                setTimeout(() => {
                    if (el) el.querySelector('.step-icon').innerHTML = '<i class="fa-solid fa-circle-check"></i>';

                    if (i === stepSeq.length - 1) {
                        setTimeout(() => {
                            overlay.style.display = 'none';
                            const profileData = MOCK_SPID_PROFILES[profileKey];
                            if (profileData) {
                                state.familyProfile = JSON.parse(JSON.stringify(profileData));
                            }

                            const sel = document.getElementById('setup-quartiere');
                            if (sel) sel.value = state.familyProfile.quartiere;
                            syncChildrenUI();

                            showPanel('panel-dashboard');
                            renderDashboard();
                            resetAiAdvisor();
                            saveStateToLocalStorage();
                        }, 600);
                    }
                }, 500);
            }, elapsed);
        });
    }

    // ═══════════════════════════════════════════════════
    // LOGOUT
    // ═══════════════════════════════════════════════════
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            setCurrentUser(null);
            state.isSpidLoggedIn = false;
            state.familyProfile = { quartiere: '', children: [] };
            state.chatHistory = [];
            localStorage.removeItem('roverfamily_state');
            showPanel('panel-landing');
        });
    }

    // ═══════════════════════════════════════════════════
    // SPEECH RECOGNITION
    // ═══════════════════════════════════════════════════
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btnMic    = document.getElementById('btn-mic-input');
    const chatInput = document.getElementById('ai-advisor-input');

    if (btnMic && SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'it-IT';
        recognition.interimResults = false;
        recognition.onstart  = () => btnMic.classList.add('active');
        recognition.onend    = () => btnMic.classList.remove('active');
        recognition.onerror  = () => btnMic.classList.remove('active');
        recognition.onresult = (ev) => {
            const t = ev.results[0][0].transcript;
            if (chatInput) { chatInput.value = t; handleAiQuery(t); chatInput.value = ''; }
        };
        btnMic.addEventListener('click', () => {
            btnMic.classList.contains('active') ? recognition.stop() : recognition.start();
        });
    } else if (btnMic) {
        btnMic.style.display = 'none';
    }

    // ═══════════════════════════════════════════════════
    // NEWS FILTERS
    // ═══════════════════════════════════════════════════
    const forMeTabBtn = document.getElementById('news-tab-for-me');
    const allTabBtn   = document.getElementById('news-tab-all');
    if (forMeTabBtn && allTabBtn) {
        forMeTabBtn.addEventListener('click', () => {
            forMeTabBtn.classList.add('active'); allTabBtn.classList.remove('active');
            state.newsFilterRelevance = 'for-me'; renderDelibere(); saveStateToLocalStorage();
        });
        allTabBtn.addEventListener('click', () => {
            allTabBtn.classList.add('active'); forMeTabBtn.classList.remove('active');
            state.newsFilterRelevance = 'all'; renderDelibere(); saveStateToLocalStorage();
        });
        if (state.newsFilterRelevance === 'for-me') { forMeTabBtn.classList.add('active'); allTabBtn.classList.remove('active'); }
        else { allTabBtn.classList.add('active'); forMeTabBtn.classList.remove('active'); }
    }

    document.querySelectorAll('.news-filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.news-filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.newsFilterCategory = pill.dataset.category;
            renderDelibere(); saveStateToLocalStorage();
        });
        if (pill.dataset.category === state.newsFilterCategory) pill.classList.add('active');
        else pill.classList.remove('active');
    });

    // ═══════════════════════════════════════════════════
    // CLEAR CHAT
    // ═══════════════════════════════════════════════════
    const btnClearChat = document.getElementById('btn-clear-chat');
    if (btnClearChat) btnClearChat.addEventListener('click', () => { resetAiAdvisor(); saveStateToLocalStorage(); });
});
