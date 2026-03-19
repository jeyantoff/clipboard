// ===== Configuration =====
// TODO: Update API_BASE_URL to your Catalyst AppSail URL in production
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://clipboard-50032944588.development.catalystappsail.in/api';

// Google OAuth Client ID (from Google Cloud Console)
// TODO: Replace with your actual Google OAuth Client ID
const GOOGLE_CLIENT_ID = '866681770856-h21bbjrr39hur2vi6afi8tihmfd1072n.apps.googleusercontent.com';

// ===== App State =====
const state = {
  user: null, // { email, name, photoUrl }
  sessionId: null,
  isReadOnly: false,
  isWriter: false,
  isAdmin: false,
  clips: [],
  presence: [],
  syncInterval: 5,
  syncTimer: null,
  presenceTimer: null,
  typingTimer: null,
  lockTimeoutTimer: null,
  debounceTimers: {},
  lastSavedText: {},
  _lastLockUid: null,
};

// ===== Constants =====
const ADMIN_EMAIL = 'jeyantjyt@gmail.com';
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;
const PRESENCE_UPDATE_MS = 30000;
const RECENT_SESSIONS_KEY = 'clipboard_recent_sessions';
const MAX_SESSIONS = 10;
const MAX_USERS_PER_SESSION = 20;

// ===== Utility Functions =====
function generateId(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function timeAgo(date) {
  if (!date) return '';
  const now = Date.now();
  const d = new Date(date);
  const diff = now - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ===== API Helper =====
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.user ? {
      'X-User-Email': state.user.email,
      'X-User-Name': state.user.name,
    } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(API_BASE_URL + path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }

  return res.json();
}

// ===== Markdown Rendering =====
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function(code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
      },
      breaks: true,
      gfm: true,
    });
    return marked.parse(text);
  }
  return text.replace(/\n/g, '<br>');
}

function renderCode(text, language) {
  if (typeof hljs !== 'undefined' && language && language !== 'plaintext') {
    try {
      const result = hljs.highlight(text, { language: language });
      return `<pre><code class="hljs language-${language}">${result.value}</code></pre>`;
    } catch (e) {}
  }
  return `<pre><code>${sanitizeHtml(text)}</code></pre>`;
}

// ===== Auth (Google Identity Services) =====
function initGoogleAuth() {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initGoogleAuth, 100);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleSignIn,
    auto_select: true,
  });

  // Check for saved user
  const saved = localStorage.getItem('clipboard_user');
  if (saved) {
    state.user = JSON.parse(saved);
    state.isAdmin = (state.user.email === ADMIN_EMAIL);
    showScreen('home');
    updateUserUI();
    loadRecentSessions();
    handleRoute();
  } else {
    showScreen('login');
  }
}

function handleGoogleSignIn(response) {
  const payload = JSON.parse(atob(response.credential.split('.')[1]));
  state.user = {
    email: payload.email,
    name: payload.name || payload.email,
    photoUrl: payload.picture || '',
  };
  state.isAdmin = (state.user.email === ADMIN_EMAIL);

  localStorage.setItem('clipboard_user', JSON.stringify(state.user));

  showScreen('home');
  updateUserUI();
  loadRecentSessions();
  handleRoute();
}

document.getElementById('google-signin-btn').addEventListener('click', () => {
  google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      google.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' }
      );
    }
  });
});

document.getElementById('signout-btn').addEventListener('click', () => {
  cleanupSession();
  state.user = null;
  state.isAdmin = false;
  localStorage.removeItem('clipboard_user');
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
  showScreen('login');
});

function updateUserUI() {
  const user = state.user;
  if (!user) return;
  document.getElementById('user-avatar').src = user.photoUrl || '';
  document.getElementById('user-name').textContent = user.name || '';
  document.getElementById('session-user-avatar').src = user.photoUrl || '';

  const adminBtn = document.getElementById('admin-btn');
  if (state.isAdmin) {
    adminBtn.classList.remove('hidden');
  } else {
    adminBtn.classList.add('hidden');
  }
}

// ===== Screens =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(name + '-screen').classList.remove('hidden');
}

// ===== Routing =====
function handleRoute() {
  if (!state.user) return;
  const hash = window.location.hash || '#/';
  const parts = hash.replace('#/', '').split('/').filter(Boolean);

  cleanupSession();

  if (parts.length === 0) {
    showScreen('home');
    loadRecentSessions();
  } else if (parts[0] === 'admin' && state.isAdmin) {
    showScreen('admin');
    loadAdminPanel();
  } else if (parts.length >= 2 && parts[1] === 'view') {
    openSession(parts[0], true);
  } else {
    openSession(parts[0], false);
  }
}

window.addEventListener('hashchange', () => {
  if (state.user) handleRoute();
});

// ===== Admin Panel =====
document.getElementById('admin-btn').addEventListener('click', () => {
  window.location.hash = '#/admin';
});

document.getElementById('admin-signout-btn').addEventListener('click', () => {
  cleanupSession();
  state.user = null;
  state.isAdmin = false;
  localStorage.removeItem('clipboard_user');
  showScreen('login');
});

document.getElementById('admin-refresh-btn').addEventListener('click', () => {
  loadAdminPanel();
});

async function loadAdminPanel() {
  if (!state.isAdmin) return;
  document.getElementById('admin-user-avatar').src = state.user.photoUrl || '';

  try {
    const sessions = await api('/sessions');
    document.getElementById('admin-total-sessions').textContent = sessions.length;

    const list = document.getElementById('admin-sessions-list');
    if (sessions.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No active sessions</p></div>';
      return;
    }

    list.innerHTML = '';
    for (const s of sessions) {
      const card = document.createElement('div');
      card.className = 'admin-session-card';
      card.innerHTML = `
        <div class="admin-session-info">
          <div class="admin-session-id">${s.id}</div>
          <div class="admin-session-meta">
            <span>Created by: ${sanitizeHtml(s.createdByName || 'Unknown')}</span>
            <span>Created: ${timeAgo(s.createdAt)}</span>
            <span>Writer: ${s.writerName || 'None'}</span>
          </div>
        </div>
        <div class="admin-session-actions">
          <button class="btn btn-ghost btn-sm admin-open-btn" data-id="${s.id}">Open</button>
          <button class="btn btn-danger btn-sm admin-delete-btn" data-id="${s.id}">Delete</button>
        </div>
      `;
      list.appendChild(card);
    }

    list.querySelectorAll('.admin-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = '#/' + btn.dataset.id;
      });
    });
    list.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm(`Delete session "${btn.dataset.id}" and all its data?`)) {
          await api('/sessions/' + btn.dataset.id, { method: 'DELETE' });
          showToast(`Session "${btn.dataset.id}" deleted`, 'success');
          loadAdminPanel();
        }
      });
    });
  } catch (err) {
    showToast('Error loading admin panel: ' + err.message, 'error');
  }
}

// ===== Home Screen =====
document.getElementById('create-session-btn').addEventListener('click', async () => {
  try {
    const result = await api('/sessions', {
      method: 'POST',
      body: JSON.stringify({ syncInterval: 5 }),
    });
    saveRecentSession(result.id);
    window.location.hash = '#/' + result.id;
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('join-btn').addEventListener('click', () => {
  const input = document.getElementById('join-input').value.trim();
  if (!input) return;
  let sessionId = input;
  if (input.includes('#/')) {
    sessionId = input.split('#/')[1].split('/')[0];
  }
  window.location.hash = '#/' + sessionId;
});

document.getElementById('join-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('join-btn').click();
});

function saveRecentSession(sessionId) {
  const recent = JSON.parse(localStorage.getItem(RECENT_SESSIONS_KEY) || '[]');
  const filtered = recent.filter(s => s.id !== sessionId);
  filtered.unshift({ id: sessionId, date: new Date().toISOString() });
  localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(filtered.slice(0, 10)));
}

function loadRecentSessions() {
  const container = document.getElementById('recent-sessions');
  const recent = JSON.parse(localStorage.getItem(RECENT_SESSIONS_KEY) || '[]');
  if (recent.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<h3>Recent Sessions</h3>' + recent.map(s => `
    <div class="session-list-item" data-session="${s.id}">
      <div>
        <div class="session-id">${s.id}</div>
        <div class="session-date">${new Date(s.date).toLocaleDateString()}</div>
      </div>
      <span style="color: var(--text-subtle)">→</span>
    </div>
  `).join('');
  container.querySelectorAll('.session-list-item').forEach(item => {
    item.addEventListener('click', () => {
      window.location.hash = '#/' + item.dataset.session;
    });
  });
}

// ===== Session =====
async function openSession(sessionId, isReadOnly) {
  try {
    const session = await api('/sessions/' + sessionId);

    state.sessionId = sessionId;
    state.isReadOnly = isReadOnly;
    state.isWriter = false;

    showScreen('session');
    document.getElementById('session-title').textContent = session.name || sessionId;

    saveRecentSession(sessionId);

    state.syncInterval = session.syncInterval || 5;
    document.getElementById('sync-interval').value = state.syncInterval;

    if (isReadOnly) {
      document.getElementById('writer-lock-bar').innerHTML = '<div class="readonly-banner">👁 Read-only mode — you can view but not edit</div>';
      document.getElementById('lock-btn').classList.add('hidden');
      document.getElementById('add-clip-area').classList.add('hidden');
      document.getElementById('sync-control').classList.add('hidden');
      document.getElementById('share-edit-btn').classList.add('hidden');
      document.getElementById('share-view-btn').classList.add('hidden');
    } else {
      document.getElementById('lock-btn').classList.remove('hidden');
      document.getElementById('sync-control').classList.remove('hidden');
      document.getElementById('share-edit-btn').classList.remove('hidden');
      document.getElementById('share-view-btn').classList.remove('hidden');
    }

    await syncClips();
    await syncLock();
    await syncPresence();
    await updatePresenceDoc(false);

    startSyncLoop();
    startPresenceLoop();
  } catch (err) {
    showToast('Session not found!', 'error');
    window.location.hash = '#/';
  }
}

function cleanupSession() {
  if (state.syncTimer) clearInterval(state.syncTimer);
  if (state.presenceTimer) clearInterval(state.presenceTimer);
  if (state.lockTimeoutTimer) clearTimeout(state.lockTimeoutTimer);
  state.syncTimer = null;
  state.presenceTimer = null;
  state.lockTimeoutTimer = null;
  state.sessionId = null;
  state.clips = [];
  state.presence = [];
  state.isWriter = false;
  state._lastLockUid = null;
  Object.values(state.debounceTimers).forEach(t => clearTimeout(t));
  state.debounceTimers = {};
  state.lastSavedText = {};
}

// ===== Sync Loop =====
let syncCycleCount = 0;
function startSyncLoop() {
  if (state.syncTimer) clearInterval(state.syncTimer);
  syncCycleCount = 0;
  state.syncTimer = setInterval(async () => {
    if (!state.sessionId) return;
    syncCycleCount++;
    try {
      await Promise.all([syncClips(), syncLock()]);
      if (syncCycleCount % 3 === 0) {
        await syncPresence();
      }
    } catch (err) {
      console.warn('Sync error:', err.message);
    }
  }, state.syncInterval * 1000);
}

document.getElementById('sync-interval').addEventListener('change', (e) => {
  const val = parseInt(e.target.value);
  state.syncInterval = val;
  if (state.sessionId) {
    startSyncLoop();
  }
});

// ===== Presence =====
function startPresenceLoop() {
  if (state.presenceTimer) clearInterval(state.presenceTimer);
  updatePresenceDoc(false);
  state.presenceTimer = setInterval(() => {
    if (state.sessionId) updatePresenceDoc(false);
  }, PRESENCE_UPDATE_MS);
}

async function updatePresenceDoc(isTyping) {
  if (!state.sessionId || !state.user) return;
  try {
    await api('/sessions/' + state.sessionId + '/presence', {
      method: 'POST',
      body: JSON.stringify({
        isTyping: isTyping,
        photoUrl: state.user.photoUrl || '',
      }),
    });
  } catch (err) {}
}

async function syncPresence() {
  if (!state.sessionId) return;
  try {
    const presences = await api('/sessions/' + state.sessionId + '/presence');
    state.presence = presences;
    renderPresence();
  } catch (err) {}
}

function renderPresence() {
  const bar = document.getElementById('presence-bar');
  const typingEl = document.getElementById('typing-indicator');

  const newPresenceKey = state.presence.map(p => p.email).sort().join(',');
  if (bar.dataset.presenceKey !== newPresenceKey) {
    bar.dataset.presenceKey = newPresenceKey;
    bar.innerHTML = state.presence.map(p => `
      <img class="avatar-sm" src="${p.photoUrl || ''}" alt="${p.displayName}" title="${p.displayName}">
    `).join('') + `<span class="presence-count">${state.presence.length}/${MAX_USERS_PER_SESSION} online</span>`;
  }

  const typingUsers = state.presence.filter(p => p.isTyping && p.email !== state.user.email);
  if (typingUsers.length > 0) {
    typingEl.textContent = typingUsers.map(u => u.displayName).join(', ') + ' is typing...';
    typingEl.classList.remove('hidden');
  } else {
    typingEl.classList.add('hidden');
  }
}

// ===== Writer Lock =====
async function syncLock() {
  if (!state.sessionId) return;
  try {
    const session = await api('/sessions/' + state.sessionId);
    const writerUid = session.writerUid;
    const writerName = session.writerName;
    const writerLockedAt = session.writerLockedAt;

    const lockBtn = document.getElementById('lock-btn');
    const lockStatus = document.getElementById('lock-status');

    if (state.isReadOnly) {
      state.isWriter = false;
      renderClipsEditState();
      return;
    }

    const prevIsWriter = state.isWriter;
    const prevLockUid = state._lastLockUid || null;
    state._lastLockUid = writerUid || null;
    const lockChanged = (writerUid || null) !== prevLockUid;

    if (!writerUid || writerUid === '') {
      state.isWriter = false;
      if (lockChanged) {
        lockStatus.innerHTML = '<span style="color: var(--text-subtle)">No one is writing</span>';
      }
      lockBtn.textContent = 'Start Writing';
      lockBtn.classList.remove('hidden');
      lockBtn.disabled = false;
    } else if (writerUid === state.user.email) {
      state.isWriter = true;
      if (lockChanged) {
        lockStatus.innerHTML = `<div class="writer-info"><img class="avatar-sm" src="${state.user.photoUrl}"> You are writing</div>`;
      }
      lockBtn.textContent = 'Stop Writing';
      lockBtn.classList.remove('hidden');
      lockBtn.disabled = false;
    } else {
      state.isWriter = false;
      const lockAge = writerLockedAt ? Date.now() - new Date(writerLockedAt).getTime() : Infinity;
      const isExpired = lockAge > LOCK_TIMEOUT_MS;

      if (lockChanged) {
        lockStatus.innerHTML = `<div class="writer-info">${sanitizeHtml(writerName)} is writing</div>`;
      }

      if (isExpired) {
        lockBtn.textContent = 'Take Over (idle)';
        lockBtn.classList.remove('hidden');
        lockBtn.disabled = false;
      } else {
        lockBtn.textContent = 'Locked';
        lockBtn.classList.remove('hidden');
        lockBtn.disabled = true;
      }
    }

    if (prevIsWriter !== state.isWriter) {
      renderClipsEditState();
    }
  } catch (err) {
    console.warn('Lock sync error:', err.message);
  }
}

document.getElementById('lock-btn').addEventListener('click', async () => {
  if (!state.sessionId || state.isReadOnly) return;

  try {
    if (state.isWriter) {
      await api('/sessions/' + state.sessionId + '/lock', { method: 'DELETE' });
      state.isWriter = false;
      await updatePresenceDoc(false);
    } else {
      await api('/sessions/' + state.sessionId + '/lock', { method: 'POST' });
      state.isWriter = true;
    }
    await syncLock();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function resetLockTimeout() {
  if (state.lockTimeoutTimer) clearTimeout(state.lockTimeoutTimer);
  state.lockTimeoutTimer = setTimeout(async () => {
    if (state.isWriter && state.sessionId) {
      try {
        await api('/sessions/' + state.sessionId + '/lock', { method: 'DELETE' });
      } catch (e) {}
      state.isWriter = false;
      await updatePresenceDoc(false);
      showToast('Write lock released due to inactivity', 'info');
      await syncLock();
    }
  }, LOCK_TIMEOUT_MS);
}

// ===== Clips =====
async function syncClips() {
  if (!state.sessionId) return;
  try {
    const newClips = await api('/sessions/' + state.sessionId + '/clips');

    newClips.forEach(c => {
      if (!(c.id in state.lastSavedText)) {
        state.lastSavedText[c.id] = c.content || '';
      }
    });

    if (state.isWriter) {
      const focusedTextarea = document.activeElement;
      const focusedClipId = (focusedTextarea && focusedTextarea.classList.contains('clip-textarea'))
        ? focusedTextarea.closest('.clip-card')?.dataset.clipId
        : null;

      const oldIds = state.clips.map(c => c.id).join(',');
      const newIds = newClips.map(c => c.id).join(',');
      const structureChanged = oldIds !== newIds;

      if (!structureChanged && focusedClipId) {
        state.clips = newClips;
        newClips.forEach(clip => {
          if (clip.id === focusedClipId) return;
          const card = document.querySelector(`.clip-card[data-clip-id="${clip.id}"]`);
          if (!card) return;
          const ta = card.querySelector('.clip-textarea');
          if (ta) ta.value = clip.content || '';
          const preview = card.querySelector('.clip-preview');
          const lang = clip.language || 'plaintext';
          if (lang === 'markdown') {
            preview.innerHTML = renderMarkdown(clip.content || '');
          } else if (lang === 'plaintext') {
            preview.innerHTML = `<pre style="white-space: pre-wrap;">${sanitizeHtml(clip.content || '')}</pre>`;
          } else {
            preview.innerHTML = renderCode(clip.content || '', lang);
          }
        });
        return;
      }
    }

    state.clips = newClips;
    renderClips();
  } catch (err) {
    console.warn('Clips sync error:', err.message);
  }
}

function renderClips() {
  const container = document.getElementById('clips-container');
  const template = document.getElementById('clip-template');

  const focusedTextarea = document.activeElement;
  let focusedClipId = null;
  let cursorPos = null;
  if (focusedTextarea && focusedTextarea.classList.contains('clip-textarea')) {
    focusedClipId = focusedTextarea.closest('.clip-card')?.dataset.clipId;
    cursorPos = { start: focusedTextarea.selectionStart, end: focusedTextarea.selectionEnd };
  }

  if (state.clips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📝</div>
        <p>No clips yet. ${state.isReadOnly ? 'Waiting for the writer...' : 'Start writing to add some!'}</p>
      </div>
    `;
  } else {
    container.innerHTML = '';
    state.clips.forEach(clip => {
      const el = template.content.cloneNode(true);
      const card = el.querySelector('.clip-card');
      card.dataset.clipId = clip.id;

      const langSelect = el.querySelector('.clip-language');
      langSelect.value = clip.language || 'plaintext';

      el.querySelector('.clip-updated').textContent = timeAgo(clip.updatedAt || clip.createdAt);
      el.querySelector('.clip-author').textContent = clip.createdByName || '';

      const textarea = el.querySelector('.clip-textarea');
      textarea.value = clip.content || '';

      const autoGrow = (ta) => {
        ta.style.height = 'auto';
        ta.style.height = Math.max(120, ta.scrollHeight) + 'px';
      };

      const preview = el.querySelector('.clip-preview');
      const lang = clip.language || 'plaintext';

      if (lang === 'markdown') {
        preview.innerHTML = renderMarkdown(clip.content || '');
      } else if (lang === 'plaintext') {
        preview.innerHTML = `<pre style="white-space: pre-wrap;">${sanitizeHtml(clip.content || '')}</pre>`;
      } else {
        preview.innerHTML = renderCode(clip.content || '', lang);
        preview.classList.add('code-preview');
      }

      const isEditing = state.isWriter && !state.isReadOnly;
      if (isEditing) {
        if (lang === 'markdown') {
          card.classList.add('split-view');
          el.querySelector('.md-toolbar').classList.remove('hidden');
        } else {
          preview.style.display = 'none';
          card.classList.remove('split-view', 'view-only');
        }
        textarea.disabled = false;
        el.querySelector('.clip-delete-btn').classList.remove('hidden');
      } else {
        card.classList.add('view-only');
        textarea.disabled = true;
      }

      if (state.isReadOnly || !state.isWriter) {
        el.querySelector('.clip-delete-btn').style.display = 'none';
      }

      langSelect.disabled = !isEditing;

      if (isEditing) {
        textarea.addEventListener('input', () => {
          autoGrow(textarea);
          handleClipInput(clip.id, textarea.value);
        });
        textarea.addEventListener('keydown', () => {
          resetLockTimeout();
          updatePresenceDoc(true);
          if (state.typingTimer) clearTimeout(state.typingTimer);
          state.typingTimer = setTimeout(() => updatePresenceDoc(false), 3000);
        });

        langSelect.addEventListener('change', async () => {
          await api('/sessions/' + state.sessionId + '/clips/' + clip.id, {
            method: 'PUT',
            body: JSON.stringify({ language: langSelect.value }),
          });
          await syncClips();
        });

        el.querySelectorAll('.md-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            applyMarkdownAction(textarea, btn.dataset.action);
            handleClipInput(clip.id, textarea.value);
          });
        });

        el.querySelector('.clip-delete-btn').addEventListener('click', async () => {
          if (confirm('Delete this clip?')) {
            await api('/sessions/' + state.sessionId + '/clips/' + clip.id, { method: 'DELETE' });
            await syncClips();
          }
        });
      }

      el.querySelector('.clip-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(clip.content || '').then(() => {
          showToast('Copied to clipboard!', 'success');
        });
      });

      container.appendChild(el);

      const appendedTa = container.lastElementChild.querySelector('.clip-textarea');
      if (appendedTa) autoGrow(appendedTa);
    });

    if (focusedClipId) {
      const card = container.querySelector(`.clip-card[data-clip-id="${focusedClipId}"]`);
      if (card) {
        const ta = card.querySelector('.clip-textarea');
        if (ta && !ta.disabled) {
          ta.focus();
          if (cursorPos) ta.setSelectionRange(cursorPos.start, cursorPos.end);
        }
      }
    }
  }

  const addArea = document.getElementById('add-clip-area');
  if (state.isWriter && !state.isReadOnly) {
    addArea.classList.remove('hidden');
  } else {
    addArea.classList.add('hidden');
  }
}

function renderClipsEditState() {
  renderClips();
}

function handleClipInput(clipId, value) {
  const card = document.querySelector(`.clip-card[data-clip-id="${clipId}"]`);
  if (card) {
    const preview = card.querySelector('.clip-preview');
    const lang = card.querySelector('.clip-language').value;
    if (lang === 'markdown') {
      preview.innerHTML = renderMarkdown(value);
    } else if (lang === 'plaintext') {
      preview.innerHTML = `<pre style="white-space: pre-wrap;">${sanitizeHtml(value)}</pre>`;
    } else {
      preview.innerHTML = renderCode(value, lang);
    }
  }

  if (state.debounceTimers[clipId]) clearTimeout(state.debounceTimers[clipId]);
  state.debounceTimers[clipId] = setTimeout(async () => {
    if (!state.sessionId || !state.isWriter) return;
    if (state.lastSavedText[clipId] === value) return;
    try {
      await api('/sessions/' + state.sessionId + '/clips/' + clipId, {
        method: 'PUT',
        body: JSON.stringify({ content: value }),
      });
      state.lastSavedText[clipId] = value;
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  }, state.syncInterval * 1000);
}

document.getElementById('add-clip-btn').addEventListener('click', async () => {
  if (!state.sessionId || !state.isWriter) return;
  try {
    await api('/sessions/' + state.sessionId + '/clips', {
      method: 'POST',
      body: JSON.stringify({
        content: '',
        language: 'plaintext',
        order: state.clips.length,
      }),
    });
    await syncClips();
  } catch (err) {
    showToast('Error adding clip: ' + err.message, 'error');
  }
});

// ===== Markdown Actions =====
function applyMarkdownAction(textarea, action) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  let insert = '';
  let cursorOffset = 0;

  switch (action) {
    case 'bold':
      insert = `**${selected || 'bold text'}**`;
      cursorOffset = selected ? insert.length : 2;
      break;
    case 'italic':
      insert = `*${selected || 'italic text'}*`;
      cursorOffset = selected ? insert.length : 1;
      break;
    case 'heading':
      insert = `### ${selected || 'Heading'}`;
      cursorOffset = insert.length;
      break;
    case 'link':
      insert = `[${selected || 'link text'}](url)`;
      cursorOffset = selected ? insert.length : 1;
      break;
    case 'code':
      insert = selected.includes('\n')
        ? `\`\`\`\n${selected || 'code'}\n\`\`\``
        : `\`${selected || 'code'}\``;
      cursorOffset = insert.length;
      break;
    case 'list':
      insert = `- ${selected || 'item'}`;
      cursorOffset = insert.length;
      break;
  }

  textarea.value = textarea.value.substring(0, start) + insert + textarea.value.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);
}

// ===== Share Links =====
document.getElementById('share-edit-btn').addEventListener('click', () => {
  const url = window.location.origin + window.location.pathname + '#/' + state.sessionId;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Edit link copied!', 'success');
  });
});

document.getElementById('share-view-btn').addEventListener('click', () => {
  const url = window.location.origin + window.location.pathname + '#/' + state.sessionId + '/view';
  navigator.clipboard.writeText(url).then(() => {
    showToast('View-only link copied!', 'success');
  });
});

// ===== Cleanup on page unload =====
window.addEventListener('beforeunload', () => {
  if (state.sessionId && state.user) {
    if (state.isWriter) {
      navigator.sendBeacon(
        API_BASE_URL + '/sessions/' + state.sessionId + '/lock',
        new Blob([JSON.stringify({ _method: 'DELETE', email: state.user.email })], { type: 'application/json' })
      );
    }
  }
});

// ===== Init =====
window.addEventListener('DOMContentLoaded', () => {
  initGoogleAuth();
});
