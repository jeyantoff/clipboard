// ===== Firebase Configuration =====
const firebaseConfig = {
  apiKey: "AIzaSyBWs6Vln4lRG2wrvoEVH2Oeaa3xnWwodVk",
  authDomain: "clipboard-aee79.firebaseapp.com",
  projectId: "clipboard-aee79",
  storageBucket: "clipboard-aee79.firebasestorage.app",
  messagingSenderId: "866681770856",
  appId: "1:866681770856:web:e8b5f3467a9461a16afcdd",
  measurementId: "G-JGZEFJQBD7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== App State =====
const state = {
  user: null,
  sessionId: null,
  isReadOnly: false,
  isWriter: false,
  isAdmin: false,
  clips: [],
  files: [],
  presence: [],
  syncInterval: 5,
  syncTimer: null,
  presenceTimer: null,
  typingTimer: null,
  lockTimeoutTimer: null,
  visitorId: generateId(8),
  debounceTimers: {},
};

// ===== Constants =====
const ADMIN_EMAIL = 'jeyantjyt@gmail.com';
const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunk size (Firestore doc limit buffer)
const MAX_FILE_SIZE_TOTAL = 20 * 1024 * 1024; // 20MB max per file (chunked)
const MAX_FILES_PER_SESSION = 5;
const MAX_TOTAL_FILE_SIZE = 5 * 1024 * 1024; // 5MB total in Firebase at any time
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const PRESENCE_UPDATE_MS = 15000; // 15s
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
  const d = date.toDate ? date.toDate() : new Date(date);
  const diff = now - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(type) {
  if (!type) return '📎';
  if (type.startsWith('image/')) return '🖼️';
  if (type === 'application/pdf') return '📄';
  if (type.startsWith('text/')) return '📝';
  return '📎';
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
    } catch (e) {
      // fallback
    }
  }
  return `<pre><code>${sanitizeHtml(text)}</code></pre>`;
}

// ===== Auth =====
document.getElementById('google-signin-btn').addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    showToast('Sign-in failed: ' + err.message, 'error');
  });
});

document.getElementById('signout-btn').addEventListener('click', () => {
  cleanupSession();
  auth.signOut();
});

auth.onAuthStateChanged(user => {
  state.user = user;
  if (user) {
    state.isAdmin = (user.email === ADMIN_EMAIL);
    showScreen('home');
    updateUserUI();
    loadRecentSessions();
    handleRoute();
  } else {
    showScreen('login');
    state.isAdmin = false;
    cleanupSession();
  }
});

function updateUserUI() {
  const user = state.user;
  if (!user) return;
  document.getElementById('user-avatar').src = user.photoURL || '';
  document.getElementById('user-name').textContent = user.displayName || '';
  document.getElementById('session-user-avatar').src = user.photoURL || '';

  // Show admin button if admin
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
  } else {
    const sessionId = parts[0];
    const isView = parts[1] === 'view';
    openSession(sessionId, isView);
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
  auth.signOut();
});

document.getElementById('admin-refresh-btn').addEventListener('click', () => {
  loadAdminPanel();
});

async function loadAdminPanel() {
  if (!state.isAdmin) return;
  document.getElementById('admin-user-avatar').src = state.user.photoURL || '';

  const snap = await db.collection('sessions')
    .orderBy('lastActiveAt', 'desc')
    .get();

  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  document.getElementById('admin-total-sessions').textContent = sessions.length;

  const list = document.getElementById('admin-sessions-list');
  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No active sessions</p></div>';
    return;
  }

  list.innerHTML = '';
  for (const s of sessions) {
    // Get presence count
    const presSnap = await db.collection('sessions').doc(s.id)
      .collection('presence')
      .where('lastSeen', '>', new firebase.firestore.Timestamp(
        Math.floor((Date.now() - 60000) / 1000), 0
      ))
      .get();
    const presenceCount = presSnap.size;

    // Get clips count
    const clipsSnap = await db.collection('sessions').doc(s.id)
      .collection('clips').get();
    const clipsCount = clipsSnap.size;

    // Get files count
    const filesSnap = await db.collection('sessions').doc(s.id)
      .collection('files').get();
    const filesCount = filesSnap.size;

    const card = document.createElement('div');
    card.className = 'admin-session-card';
    card.innerHTML = `
      <div class="admin-session-info">
        <div class="admin-session-id">${s.id}</div>
        <div class="admin-session-meta">
          <span>Created by: ${s.createdBy?.displayName || 'Unknown'}</span>
          <span>Last active: ${timeAgo(s.lastActiveAt)}</span>
          <span>${presenceCount} online</span>
          <span>${clipsCount} clips</span>
          <span>${filesCount} files</span>
          <span>Writer: ${s.writerLock ? sanitizeHtml(s.writerLock.displayName) : 'None'}</span>
        </div>
      </div>
      <div class="admin-session-actions">
        <button class="btn btn-ghost btn-sm admin-open-btn" data-id="${s.id}">Open</button>
        <button class="btn btn-danger btn-sm admin-delete-btn" data-id="${s.id}">Delete</button>
      </div>
    `;
    list.appendChild(card);
  }

  // Bind events
  list.querySelectorAll('.admin-open-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = '#/' + btn.dataset.id;
    });
  });
  list.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`Delete session "${btn.dataset.id}" and all its data?`)) {
        await deleteSession(btn.dataset.id);
        loadAdminPanel();
      }
    });
  });
}

async function deleteSession(sessionId) {
  // Delete all subcollections
  const collections = ['clips', 'files', 'file_chunks', 'presence'];
  for (const col of collections) {
    const snap = await db.collection('sessions').doc(sessionId).collection(col).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    if (snap.docs.length > 0) await batch.commit();
  }
  // Delete session doc
  await db.collection('sessions').doc(sessionId).delete();
  showToast(`Session "${sessionId}" deleted`, 'success');
}

// ===== Home Screen =====
document.getElementById('create-session-btn').addEventListener('click', async () => {
  // Check session limit
  const allSessions = await db.collection('sessions').get();
  if (allSessions.size >= MAX_SESSIONS) {
    showToast(`Max ${MAX_SESSIONS} active sessions reached! Ask admin to clean up.`, 'error');
    return;
  }

  const sessionId = generateId(8);
  await db.collection('sessions').doc(sessionId).set({
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
    syncInterval: 5,
    writerLock: null,
    createdBy: { uid: state.user.uid, displayName: state.user.displayName },
  });
  saveRecentSession(sessionId);
  window.location.hash = '#/' + sessionId;
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
  const docRef = db.collection('sessions').doc(sessionId);
  const doc = await docRef.get();

  if (!doc.exists) {
    showToast('Session not found!', 'error');
    window.location.hash = '#/';
    return;
  }

  // Check user limit (only for non-admin)
  if (!state.isAdmin) {
    const presSnap = await db.collection('sessions').doc(sessionId)
      .collection('presence')
      .where('lastSeen', '>', new firebase.firestore.Timestamp(
        Math.floor((Date.now() - 60000) / 1000), 0
      ))
      .get();
    if (presSnap.size >= MAX_USERS_PER_SESSION) {
      showToast(`Session full! Max ${MAX_USERS_PER_SESSION} users allowed.`, 'error');
      window.location.hash = '#/';
      return;
    }
  }

  state.sessionId = sessionId;
  state.isReadOnly = isReadOnly;
  state.isWriter = false;

  showScreen('session');
  document.getElementById('session-title').textContent = sessionId;

  saveRecentSession(sessionId);
  docRef.update({ lastActiveAt: firebase.firestore.FieldValue.serverTimestamp() });

  const data = doc.data();
  state.syncInterval = data.syncInterval || 5;
  document.getElementById('sync-interval').value = state.syncInterval;

  if (isReadOnly) {
    document.getElementById('writer-lock-bar').innerHTML = '<div class="readonly-banner">👁 Read-only mode — you can view but not edit</div>';
    document.getElementById('lock-btn').classList.add('hidden');
    document.getElementById('add-clip-area').classList.add('hidden');
    document.getElementById('upload-area').classList.add('hidden');
    document.getElementById('sync-control').classList.add('hidden');
    document.getElementById('share-edit-btn').classList.add('hidden');
  } else {
    document.getElementById('lock-btn').classList.remove('hidden');
    document.getElementById('sync-control').classList.remove('hidden');
    document.getElementById('share-edit-btn').classList.remove('hidden');
  }

  await syncClips();
  await syncFiles();
  await syncLock();
  await syncPresence();
  updatePresenceDoc(false);

  startSyncLoop();
  startPresenceLoop();
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
  state.files = [];
  state.presence = [];
  state.isWriter = false;
  Object.values(state.debounceTimers).forEach(t => clearTimeout(t));
  state.debounceTimers = {};
}

// ===== Sync Loop =====
function startSyncLoop() {
  if (state.syncTimer) clearInterval(state.syncTimer);
  state.syncTimer = setInterval(async () => {
    if (!state.sessionId) return;
    await Promise.all([syncClips(), syncFiles(), syncLock(), syncPresence()]);
  }, state.syncInterval * 1000);
}

document.getElementById('sync-interval').addEventListener('change', async (e) => {
  const val = parseInt(e.target.value);
  state.syncInterval = val;
  if (state.sessionId) {
    await db.collection('sessions').doc(state.sessionId).update({ syncInterval: val });
    startSyncLoop();
  }
});

// ===== Presence =====
function startPresenceLoop() {
  if (state.presenceTimer) clearInterval(state.presenceTimer);
  state.presenceTimer = setInterval(() => {
    if (state.sessionId) updatePresenceDoc(false);
  }, PRESENCE_UPDATE_MS);
}

async function updatePresenceDoc(isTyping) {
  if (!state.sessionId || !state.user) return;
  const ref = db.collection('sessions').doc(state.sessionId)
    .collection('presence').doc(state.user.uid);
  await ref.set({
    uid: state.user.uid,
    displayName: state.user.displayName || 'Anonymous',
    photoURL: state.user.photoURL || '',
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    isTyping: isTyping,
  });
}

async function syncPresence() {
  if (!state.sessionId) return;
  const snap = await db.collection('sessions').doc(state.sessionId)
    .collection('presence')
    .where('lastSeen', '>', new firebase.firestore.Timestamp(
      Math.floor((Date.now() - 60000) / 1000), 0
    ))
    .get();

  state.presence = snap.docs.map(d => d.data());
  renderPresence();
}

function renderPresence() {
  const bar = document.getElementById('presence-bar');
  const typingEl = document.getElementById('typing-indicator');

  bar.innerHTML = state.presence.map(p => `
    <img class="avatar-sm" src="${p.photoURL}" alt="${p.displayName}" title="${p.displayName}">
  `).join('') + `<span class="presence-count">${state.presence.length}/${MAX_USERS_PER_SESSION} online</span>`;

  const typingUsers = state.presence.filter(p => p.isTyping && p.uid !== state.user.uid);
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
  const doc = await db.collection('sessions').doc(state.sessionId).get();
  const data = doc.data();
  const lock = data.writerLock;
  const lockBtn = document.getElementById('lock-btn');
  const lockStatus = document.getElementById('lock-status');

  if (!lock) {
    state.isWriter = false;
    lockStatus.innerHTML = '<span style="color: var(--text-subtle)">No one is writing</span>';
    if (!state.isReadOnly) {
      lockBtn.textContent = 'Start Writing';
      lockBtn.classList.remove('hidden');
      lockBtn.disabled = false;
    }
  } else if (lock.uid === state.user.uid) {
    state.isWriter = true;
    lockStatus.innerHTML = `<div class="writer-info"><img class="avatar-sm" src="${lock.photoURL}"> You are writing</div>`;
    lockBtn.textContent = 'Stop Writing';
    lockBtn.classList.remove('hidden');
    lockBtn.disabled = false;
  } else {
    state.isWriter = false;
    const lockAge = Date.now() - (lock.lockedAt.toDate ? lock.lockedAt.toDate().getTime() : lock.lockedAt);
    const isExpired = lockAge > LOCK_TIMEOUT_MS;

    lockStatus.innerHTML = `<div class="writer-info"><img class="avatar-sm" src="${lock.photoURL}"> ${sanitizeHtml(lock.displayName)} is writing</div>`;

    if (!state.isReadOnly) {
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
  }

  renderClipsEditState();
}

document.getElementById('lock-btn').addEventListener('click', async () => {
  if (!state.sessionId || state.isReadOnly) return;

  if (state.isWriter) {
    await db.collection('sessions').doc(state.sessionId).update({ writerLock: null });
    state.isWriter = false;
    await updatePresenceDoc(false);
  } else {
    await db.collection('sessions').doc(state.sessionId).update({
      writerLock: {
        uid: state.user.uid,
        displayName: state.user.displayName || 'Anonymous',
        photoURL: state.user.photoURL || '',
        lockedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    });
    state.isWriter = true;
  }
  await syncLock();
});

function resetLockTimeout() {
  if (state.lockTimeoutTimer) clearTimeout(state.lockTimeoutTimer);
  state.lockTimeoutTimer = setTimeout(async () => {
    if (state.isWriter && state.sessionId) {
      await db.collection('sessions').doc(state.sessionId).update({ writerLock: null });
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
  const snap = await db.collection('sessions').doc(state.sessionId)
    .collection('clips')
    .orderBy('order')
    .get();

  state.clips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderClips();
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
    return;
  }

  container.innerHTML = '';
  state.clips.forEach(clip => {
    const el = template.content.cloneNode(true);
    const card = el.querySelector('.clip-card');
    card.dataset.clipId = clip.id;

    const langSelect = el.querySelector('.clip-language');
    langSelect.value = clip.language || 'plaintext';

    el.querySelector('.clip-updated').textContent = timeAgo(clip.updatedAt);
    el.querySelector('.clip-author').textContent = clip.updatedBy?.displayName || '';

    const textarea = el.querySelector('.clip-textarea');
    textarea.value = clip.text || '';

    const preview = el.querySelector('.clip-preview');
    const lang = clip.language || 'plaintext';

    if (lang === 'markdown') {
      preview.innerHTML = renderMarkdown(clip.text || '');
    } else if (lang === 'plaintext') {
      preview.innerHTML = `<pre style="white-space: pre-wrap;">${sanitizeHtml(clip.text || '')}</pre>`;
    } else {
      preview.innerHTML = renderCode(clip.text || '', lang);
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
      textarea.addEventListener('input', () => handleClipInput(clip.id, textarea.value));
      textarea.addEventListener('keydown', () => {
        resetLockTimeout();
        updatePresenceDoc(true);
        if (state.typingTimer) clearTimeout(state.typingTimer);
        state.typingTimer = setTimeout(() => updatePresenceDoc(false), 3000);
      });

      langSelect.addEventListener('change', async () => {
        await db.collection('sessions').doc(state.sessionId)
          .collection('clips').doc(clip.id)
          .update({ language: langSelect.value });
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
          await db.collection('sessions').doc(state.sessionId)
            .collection('clips').doc(clip.id).delete();
          await syncClips();
        }
      });
    }

    el.querySelector('.clip-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(clip.text || '').then(() => {
        showToast('Copied to clipboard!', 'success');
      });
    });

    container.appendChild(el);
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

  const addArea = document.getElementById('add-clip-area');
  if (state.isWriter && !state.isReadOnly) {
    addArea.classList.remove('hidden');
  } else {
    addArea.classList.add('hidden');
  }

  const uploadArea = document.getElementById('upload-area');
  if (state.isWriter && !state.isReadOnly) {
    uploadArea.classList.remove('hidden');
  } else {
    uploadArea.classList.add('hidden');
  }
}

function renderClipsEditState() {
  renderClips();
}

function handleClipInput(clipId, value) {
  if (state.debounceTimers[clipId]) clearTimeout(state.debounceTimers[clipId]);
  state.debounceTimers[clipId] = setTimeout(async () => {
    if (!state.sessionId || !state.isWriter) return;
    await db.collection('sessions').doc(state.sessionId)
      .collection('clips').doc(clipId)
      .update({
        text: value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: { uid: state.user.uid, displayName: state.user.displayName || '' },
      });
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
  }, 500);
}

document.getElementById('add-clip-btn').addEventListener('click', async () => {
  if (!state.sessionId || !state.isWriter) return;
  const order = state.clips.length;
  await db.collection('sessions').doc(state.sessionId)
    .collection('clips').add({
      text: '',
      language: 'plaintext',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: { uid: state.user.uid, displayName: state.user.displayName || '' },
      order: order,
    });
  await syncClips();
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

// ===== Files (Chunked Upload/Download) =====
// Strategy:
// - Files <= 1MB: stored directly in files/{fileId} as base64 (same as before)
// - Files > 1MB: metadata in files/{fileId}, chunks in file_chunks/{fileId}_chunk_{N}
//   Only the first 1MB chunk is uploaded initially. Remaining chunks upload on-demand
//   when download is invoked (streamed from client-side buffer held in memory).

// Pending large file uploads waiting for download trigger
const pendingLargeFiles = {}; // fileId -> { file: File, chunksUploaded: 1, totalChunks: N }

async function syncFiles() {
  if (!state.sessionId) return;
  const snap = await db.collection('sessions').doc(state.sessionId)
    .collection('files')
    .orderBy('uploadedAt', 'desc')
    .get();

  state.files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFiles();
}

function renderFiles() {
  const container = document.getElementById('files-container');
  const usageEl = document.getElementById('file-usage');

  const totalSize = state.files.reduce((acc, f) => acc + (f.size || 0), 0);
  usageEl.textContent = `${state.files.length}/${MAX_FILES_PER_SESSION} files · ${formatFileSize(totalSize)} stored`;

  if (state.files.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 16px;"><p style="font-size: 14px;">No files uploaded</p></div>';
    return;
  }

  container.innerHTML = state.files.map(f => {
    const isChunked = f.totalChunks > 1;
    const isPending = !!pendingLargeFiles[f.id];
    const statusText = isChunked
      ? (isPending ? `Waiting for download (${f.totalChunks} chunks)` : `${f.totalChunks} chunks`)
      : '';

    return `
      <div class="file-card" data-file-id="${f.id}">
        <div class="file-info">
          <span class="file-icon">${getFileIcon(f.type || '')}</span>
          <div>
            <div class="file-name">${sanitizeHtml(f.name)}</div>
            <div class="file-size">${formatFileSize(f.totalSize || f.size || 0)} ${statusText ? '· ' + statusText : ''}</div>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn btn-secondary btn-xs file-download-btn">⬇ Download</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.file-download-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fileId = btn.closest('.file-card').dataset.fileId;
      btn.disabled = true;
      btn.textContent = 'Downloading...';
      try {
        await downloadFile(fileId);
      } catch (e) {
        showToast('Download failed: ' + e.message, 'error');
      }
      btn.disabled = false;
      btn.textContent = '⬇ Download';
    });
  });
}

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (!state.isWriter || !state.sessionId) {
    showToast('You must be the writer to upload files', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE_TOTAL) {
    showToast(`File too large! Max ${formatFileSize(MAX_FILE_SIZE_TOTAL)}`, 'error');
    return;
  }

  if (state.files.length >= MAX_FILES_PER_SESSION) {
    showToast(`Max ${MAX_FILES_PER_SESSION} files per session`, 'error');
    return;
  }

  const totalStored = state.files.reduce((acc, f) => acc + (f.size || 0), 0);

  if (file.size <= CHUNK_SIZE) {
    // Small file: upload directly
    if (totalStored + file.size > MAX_TOTAL_FILE_SIZE) {
      showToast(`Firebase storage limit ${formatFileSize(MAX_TOTAL_FILE_SIZE)} exceeded`, 'error');
      return;
    }
    await uploadSmallFile(file);
  } else {
    // Large file: upload first chunk (1MB buffer), rest on-demand
    const firstChunkSize = Math.min(CHUNK_SIZE, file.size);
    if (totalStored + firstChunkSize > MAX_TOTAL_FILE_SIZE) {
      showToast(`Firebase storage limit ${formatFileSize(MAX_TOTAL_FILE_SIZE)} exceeded (need ${formatFileSize(firstChunkSize)} for first chunk)`, 'error');
      return;
    }
    await uploadLargeFile(file);
  }
});

async function uploadSmallFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    await db.collection('sessions').doc(state.sessionId)
      .collection('files').add({
        name: file.name,
        size: file.size,
        totalSize: file.size,
        type: file.type,
        data: base64,
        totalChunks: 1,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
        uploadedBy: { uid: state.user.uid, displayName: state.user.displayName || '' },
      });
    showToast(`"${file.name}" uploaded!`, 'success');
    await syncFiles();
  };
  reader.readAsDataURL(file);
}

async function uploadLargeFile(file) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Read first chunk
  const firstChunkBlob = file.slice(0, CHUNK_SIZE);
  const firstChunkBase64 = await blobToBase64(firstChunkBlob);

  // Create file metadata doc
  const fileRef = await db.collection('sessions').doc(state.sessionId)
    .collection('files').add({
      name: file.name,
      size: firstChunkBase64.length, // Only first chunk stored in Firebase
      totalSize: file.size,
      type: file.type,
      totalChunks: totalChunks,
      chunksUploaded: 1,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: { uid: state.user.uid, displayName: state.user.displayName || '' },
    });

  // Store first chunk
  await db.collection('sessions').doc(state.sessionId)
    .collection('file_chunks').doc(fileRef.id + '_chunk_0').set({
      fileId: fileRef.id,
      chunkIndex: 0,
      data: firstChunkBase64,
    });

  // Keep remaining file in memory for on-demand upload
  pendingLargeFiles[fileRef.id] = {
    file: file,
    chunksUploaded: 1,
    totalChunks: totalChunks,
  };

  showToast(`"${file.name}" — first chunk uploaded. Remaining ${totalChunks - 1} chunks will upload when someone downloads.`, 'success');
  await syncFiles();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadFile(fileId) {
  const fileDoc = await db.collection('sessions').doc(state.sessionId)
    .collection('files').doc(fileId).get();

  if (!fileDoc.exists) {
    showToast('File not found', 'error');
    return;
  }

  const fileMeta = fileDoc.data();

  if (fileMeta.totalChunks <= 1 && fileMeta.data) {
    // Small file: download directly
    const blob = base64ToBlob(fileMeta.data, fileMeta.type);
    triggerDownload(blob, fileMeta.name);
  } else {
    // Large file: need to upload remaining chunks first, then download
    const pending = pendingLargeFiles[fileId];

    if (pending) {
      // We are the uploader — upload remaining chunks now
      showToast(`Uploading remaining chunks for "${fileMeta.name}"...`, 'info');

      for (let i = pending.chunksUploaded; i < pending.totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, pending.file.size);
        const chunkBlob = pending.file.slice(start, end);
        const chunkBase64 = await blobToBase64(chunkBlob);

        await db.collection('sessions').doc(state.sessionId)
          .collection('file_chunks').doc(fileId + '_chunk_' + i).set({
            fileId: fileId,
            chunkIndex: i,
            data: chunkBase64,
          });
      }

      // Now download all chunks
      await downloadChunkedFile(fileId, fileMeta);

      // Cleanup pending
      delete pendingLargeFiles[fileId];
    } else {
      // We are a different user — download available chunks
      await downloadChunkedFile(fileId, fileMeta);
    }
  }

  // Auto-delete from Firebase after download
  await deleteFileFromFirebase(fileId, fileMeta.totalChunks);
  showToast(`File downloaded & removed from server`, 'success');
  await syncFiles();
}

async function downloadChunkedFile(fileId, fileMeta) {
  const chunks = [];

  for (let i = 0; i < fileMeta.totalChunks; i++) {
    const chunkDoc = await db.collection('sessions').doc(state.sessionId)
      .collection('file_chunks').doc(fileId + '_chunk_' + i).get();

    if (!chunkDoc.exists) {
      throw new Error(`Chunk ${i} not found. File may not be fully uploaded yet.`);
    }
    chunks.push(chunkDoc.data().data);
  }

  // Combine chunks
  const combinedBinary = chunks.map(c => atob(c)).join('');
  const bytes = new Uint8Array(combinedBinary.length);
  for (let i = 0; i < combinedBinary.length; i++) bytes[i] = combinedBinary.charCodeAt(i);
  const blob = new Blob([bytes], { type: fileMeta.type || 'application/octet-stream' });

  triggerDownload(blob, fileMeta.name);
}

async function deleteFileFromFirebase(fileId, totalChunks) {
  // Delete chunks
  if (totalChunks > 1) {
    for (let i = 0; i < totalChunks; i++) {
      const chunkRef = db.collection('sessions').doc(state.sessionId)
        .collection('file_chunks').doc(fileId + '_chunk_' + i);
      await chunkRef.delete().catch(() => {}); // ignore if doesn't exist
    }
  }
  // Delete file doc
  await db.collection('sessions').doc(state.sessionId)
    .collection('files').doc(fileId).delete();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
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
    const ref = db.collection('sessions').doc(state.sessionId)
      .collection('presence').doc(state.user.uid);
    ref.delete();

    if (state.isWriter) {
      db.collection('sessions').doc(state.sessionId).update({ writerLock: null });
    }
  }
});
