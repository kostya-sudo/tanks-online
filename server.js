// ============================================================
// НАСТРОЙКА АДРЕСА СЕРВЕРА
// ============================================================
// ⚠️ ЗАМЕНИ на URL своего сервера на Render/Railway/Fly.io
const SERVER_URL = ''https://tanks-online-kt90.onrender.com;

// ============================================================
// СЕТЕВОЙ СЛОЙ
// ============================================================
const Net = {
    token: null,
    user: null,
    socket: null,
    inGame: false,
    callbacks: {},
    lastState: null,

    init() {
        try {
            const savedToken = localStorage.getItem('tanki_token');
            const savedUser = localStorage.getItem('tanki_user_data');
            if (savedToken) this.token = savedToken;
            if (savedUser) this.user = JSON.parse(savedUser);
        } catch (e) {
            console.warn('Не удалось загрузить сессию', e);
        }
    },

    saveSession(token, user) {
        this.token = token;
        this.user = user;
        try {
            localStorage.setItem('tanki_token', token);
            localStorage.setItem('tanki_user_data', JSON.stringify(user));
        } catch (e) {}
    },

    clearSession() {
        this.token = null;
        this.user = null;
        try {
            localStorage.removeItem('tanki_token');
            localStorage.removeItem('tanki_user_data');
        } catch (e) {}
    },

    on(event, cb) {
        this.callbacks[event] = cb;
    },

    emitLocal(event, data) {
        if (this.callbacks[event]) {
            try { this.callbacks[event](data); }
            catch (e) { console.error('Ошибка в обработчике', event, e); }
        }
    },

    // ============================================================
    // REST API
    // ============================================================
    async register(nick, password) {
        const res = await fetch(`${SERVER_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
        this.saveSession(data.token, data.user);
        return data;
    },

    async login(nick, password) {
        const res = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка входа');
        this.saveSession(data.token, data.user);
        return data;
    },

    async getLeaderboard() {
        const res = await fetch(`${SERVER_URL}/api/leaderboard`);
        if (!res.ok) throw new Error('Не удалось загрузить лидерборд');
        return await res.json();
    },

    async checkServer() {
        try {
            const res = await fetch(`${SERVER_URL}/api/health`);
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    // ============================================================
    // SOCKET.IO
    // ============================================================
    connect() {
        if (this.socket && this.socket.connected) return;

        if (typeof io === 'undefined') {
            console.error('❌ Socket.IO клиент не загружен');
            return;
        }

        this.socket = io(SERVER_URL, {
            auth: { token: this.token || '' },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу');
            this.emitLocal('connected');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Отключено:', reason);
            this.emitLocal('disconnected', reason);
        });

        this.socket.on('connect_error', (err) => {
            console.error('Ошибка подключения:', err.message);
            this.emitLocal('connect_error', err.message);
        });

        this.socket.on('waiting', (data) => {
            this.emitLocal('waiting', data);
        });

        this.socket.on('game_start', (data) => {
            this.inGame = true;
            console.log('🎮 Игра началась:', data);
            this.emitLocal('game_start', data);
        });

        this.socket.on('game_state', (state) => {
            this.lastState = state;
            this.emitLocal('game_state', state);
        });

        this.socket.on('game_end', (data) => {
            this.inGame = false;
            console.log('🏁 Игра завершена');
            this.emitLocal('game_end', data);
        });
    },

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    },

    findGame(opts = {}) {
        if (!this.socket) this.connect();
        this.socket.emit('find_game', {
            maxPlayers: opts.maxPlayers || 4,
            mode: opts.mode || 'deathmatch',
            map: opts.map || 'classic'
        });
    },

    cancelFind() {
        if (this.socket) this.socket.emit('cancel_find');
    },

    sendInput(action, pressed) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('input', { action, pressed });
        }
    },

    leaveGame() {
        if (this.socket) {
            this.socket.emit('cancel_find');
            // Сервер отключит нас сам при disconnect
        }
    }
};

// Автоинициализация
Net.init();
