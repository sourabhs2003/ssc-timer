// app.js – SSC-X Focus Tracker (plain script, no ESM – works from file://)
// Firebase is loaded via compat CDN in index.html

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const SYLLABUS_DEADLINE = new Date('2026-12-31T23:59:59');
const EXAM_DATE         = new Date('2027-05-01T00:00:00');
const SUBJECT_COLORS    = ['#6366f1','#06b6d4','#22c55e','#f97316','#ec4899','#8b5cf6','#eab308','#14b8a6'];
const TODAY             = () => new Date().toISOString().slice(0, 10);

// ── LocalStorage helpers ─────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── Firebase helpers ─────────────────────────────────────────────────────────
let db = null;
let fbReady = false;

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') return;
    const cfg = {
      apiKey: "AIzaSyCZMfIl46ea7C_1U_8XEmjpeImg4-so9tk",
      authDomain: "sourabhzssc.firebaseapp.com",
      projectId: "sourabhzssc",
      storageBucket: "sourabhzssc.firebasestorage.app",
      messagingSenderId: "31742915782",
      appId: "1:31742915782:web:29fa2b94b6d146aea6d3c7"
    };
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    db = firebase.firestore();
    fbReady = true;
    document.getElementById('firebase-dot').style.background = 'var(--green)';
    document.getElementById('firebase-dot').title = 'Firebase connected';
    syncFromFirebase();
  } catch(e) {
    console.warn('[Firebase]', e.message);
  }
}

async function fbAdd(col, data) {
  if (!fbReady) return null;
  try { const r = await db.collection('sscx_' + col).add(data); return r.id; } catch { return null; }
}
async function fbSet(col, id, data) {
  if (!fbReady) return;
  try { await db.collection('sscx_' + col).doc(id).set(data, { merge: true }); } catch {}
}
async function fbDelete(col, id) {
  if (!fbReady) return;
  try { await db.collection('sscx_' + col).doc(id).delete(); } catch {}
}
async function fbGetAll(col) {
  if (!fbReady) return [];
  try {
    const snap = await db.collection('sscx_' + col).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function syncFromFirebase() {
  try {
    const [fbSubj, fbSess, fbTodo] = await Promise.all([fbGetAll('subjects'), fbGetAll('sessions'), fbGetAll('todos')]);
    if (fbSubj.length) { state.subjects = fbSubj; saveSubjectsLS(); }
    if (fbSess.length) { state.sessions = fbSess; saveSessionsLS(); }
    if (fbTodo.length) { state.todos = fbTodo; saveTodosLS(); }
    
    checkDailyReset();
    renderAll();
  } catch {}
}

var state = {
  tab: 'timer',
  subjects: [],
  sessions: [],
  todos: [],
  taskTab: 'daily',
  activeSession: null,
  selectedSubject: '',
  analyticsTab: 'week',
};
var charts = {};

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  registerSW();
  loadFromLS();
  checkDailyReset();
  renderAll();
  bindNav();
  bindTimer();
  bindSubjects();
  bindTodos();
  bindAnalyticsTabs();
  setDateDisplay();
  checkActiveSession();
  // Firebase init (non-blocking, after render)
  setTimeout(initFirebase, 500);
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function(){});
  }
}

function setDateDisplay() {
  var el = document.getElementById('date-display');
  if (el) el.textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ── LS ────────────────────────────────────────────────────────────────────────
function loadFromLS() {
  state.subjects = LS.get('sscx_subjects', []);
  state.sessions = LS.get('sscx_sessions', []);
  state.todos    = LS.get('sscx_todos', []);
  state.activeSession = LS.get('sscx_active_session', null);
}
function saveSubjectsLS() { LS.set('sscx_subjects', state.subjects); }
function saveSessionsLS() { LS.set('sscx_sessions', state.sessions); }
function saveTodosLS()    { LS.set('sscx_todos', state.todos); }
function saveActiveSessionLS() {
  if (state.activeSession) LS.set('sscx_active_session', state.activeSession);
  else localStorage.removeItem('sscx_active_session');
}

// ── Navigation ────────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
  });
}
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  var page = document.getElementById('page-' + tab);
  if (page) page.classList.add('active');
  var navBtn = document.querySelector('.nav-btn[data-tab="' + tab + '"]');
  if (navBtn) navBtn.classList.add('active');
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'analytics') renderAnalytics();
  if (tab === 'targets')   renderTargets();
  if (tab === 'subjects')  renderSubjectsList();
  if (tab === 'timer')     renderRecentSessions();
  if (tab === 'tasks')     renderTasks();
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
function checkActiveSession() {
  if (state.activeSession) {
    state.selectedSubject = state.activeSession.subject;
    var sel = document.getElementById('subject-select');
    if (sel) sel.value = state.selectedSubject;
    
    var timeStr = new Date(state.activeSession.startTime).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'});
    var subjField = document.getElementById('active-session-subject');
    var timeField = document.getElementById('active-session-time');
    
    if(subjField) subjField.textContent = state.selectedSubject;
    if(timeField) timeField.textContent = timeStr;
    
    var startView = document.getElementById('session-start-view');
    var activeView = document.getElementById('session-active-view');
    if(startView) startView.classList.add('hidden');
    if(activeView) activeView.classList.remove('hidden');
  } else {
    var startView = document.getElementById('session-start-view');
    var activeView = document.getElementById('session-active-view');
    if(startView) startView.classList.remove('hidden');
    if(activeView) activeView.classList.add('hidden');
  }
}

// getActiveSessionElapsed removed as it's no longer needed for continuous display

function bindTimer() {
  document.getElementById('btn-start').addEventListener('click', timerStart);
  document.getElementById('btn-stop').addEventListener('click',  timerStop);
}

function timerStart() {
  var subj = document.getElementById('subject-select').value;
  if (!subj) { showToast('⚠️ Select a subject first!'); return; }
  state.selectedSubject = subj;
  
  if (!state.activeSession) {
    state.activeSession = {
      subject: subj,
      startTime: Date.now(),
      isActive: true
    };
    saveActiveSessionLS();
    checkActiveSession(); // Re-renders the session card
  }
}

function timerStop() {
  if (!state.activeSession) return;
  
  var endTime = Date.now();
  var totalSec = Math.floor((endTime - state.activeSession.startTime) / 1000);
  
  if (totalSec < 60) { 
    showToast('⚡ Session too short – keep going!'); 
    resetTimer(); 
    return; 
  }

  var durationMins = Math.round(totalSec / 60);
  var session = {
    id:        's_' + Date.now(),
    subject:   state.activeSession.subject,
    startTime: new Date(state.activeSession.startTime).toISOString(),
    endTime:   new Date(endTime).toISOString(),
    duration:  durationMins,
    date:      TODAY(),
  };
  state.sessions.unshift(session);
  saveSessionsLS();
  fbAdd('sessions', session).then(function(id) {
    if (id) { session.id = id; saveSessionsLS(); }
  });
  showToast('✅ ' + durationMins + ' min logged – ' + state.activeSession.subject);
  resetTimer();
  renderRecentSessions();
  if (state.tab === 'dashboard') renderDashboard();
}

// Animation and render UI functions removed for static card view

function resetTimer() {
  state.activeSession = null;
  saveActiveSessionLS();
  checkActiveSession(); // This will clear the card and show the Start UI
}

// old logic for updateTimerButtons removed

function renderRecentSessions() {
  var container = document.getElementById('recent-sessions');
  if (!container) return;
  var recent = state.sessions.slice(0, 6);
  if (!recent.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">No sessions yet – start your first!</div></div>';
    return;
  }
  container.innerHTML = recent.map(function(s) {
    var subj      = state.subjects.find(function(sb) { return sb.name === s.subject; });
    var color     = subj ? SUBJECT_COLORS[subj.colorIdx % SUBJECT_COLORS.length] : '#6366f1';
    var endDate   = s.endTime ? new Date(s.endTime) : null;
    var time      = (endDate && !isNaN(endDate)) ? endDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';
    var dateLabel = s.date === TODAY() ? 'Today' : (s.date ? s.date.slice(5).replace('-','/') : '');
    return '<div class="session-item">' +
      '<div><div class="session-subj" style="color:' + color + '">' + s.subject + '</div>' +
      '<div class="session-meta">' + dateLabel + ' · ' + time + '</div></div>' +
      '<div class="session-dur">' + s.duration + 'm</div></div>';
  }).join('');
}

// ── SUBJECTS ──────────────────────────────────────────────────────────────────
function bindSubjects() {
  document.getElementById('btn-add-subject').addEventListener('click', function() { openSubjectModal(null); });
  document.getElementById('btn-save-subject').addEventListener('click', saveSubject);
  document.getElementById('btn-cancel-subject').addEventListener('click', closeSubjectModal);
  document.getElementById('subject-modal-overlay').addEventListener('click', function(e) {
    if (e.target.id === 'subject-modal-overlay') closeSubjectModal();
  });
}

var editingSubjectId = null;

function openSubjectModal(id) {
  editingSubjectId = id || null;
  var subj = id ? state.subjects.find(function(s) { return s.id === id; }) : null;
  document.getElementById('modal-subj-name').value     = subj ? subj.name : '';
  document.getElementById('modal-subj-strength').value = subj ? subj.strength : 'neutral';
  document.getElementById('subject-modal-overlay').classList.add('show');
  setTimeout(function() { document.getElementById('modal-subj-name').focus(); }, 100);
}
function closeSubjectModal() {
  document.getElementById('subject-modal-overlay').classList.remove('show');
  editingSubjectId = null;
}
function saveSubject() {
  var name     = document.getElementById('modal-subj-name').value.trim();
  var strength = document.getElementById('modal-subj-strength').value;
  if (!name) { showToast('Enter a subject name'); return; }

  if (editingSubjectId) {
    var idx = state.subjects.findIndex(function(s) { return s.id === editingSubjectId; });
    if (idx > -1) {
      state.subjects[idx].name     = name;
      state.subjects[idx].strength = strength;
      fbSet('subjects', editingSubjectId, { name: name, strength: strength });
    }
    showToast('✅ Subject updated');
  } else {
    if (state.subjects.find(function(s) { return s.name.toLowerCase() === name.toLowerCase(); })) {
      showToast('⚠️ Subject already exists'); return;
    }
    var newSubj = { id: 'sub_' + Date.now(), name: name, strength: strength, colorIdx: state.subjects.length, createdAt: Date.now() };
    state.subjects.push(newSubj);
    fbAdd('subjects', newSubj).then(function(id) { if (id) { newSubj.id = id; saveSubjectsLS(); } });
    showToast('✅ Subject added');
  }
  saveSubjectsLS();
  closeSubjectModal();
  renderSubjectsList();
  populateSubjectPicker();
}
function deleteSubject(id) {
  state.subjects = state.subjects.filter(function(s) { return s.id !== id; });
  saveSubjectsLS();
  fbDelete('subjects', id);
  renderSubjectsList();
  populateSubjectPicker();
  showToast('Subject removed');
}
window.editSubj = function(id) { openSubjectModal(id); };
window.delSubj  = function(id) { if (confirm('Delete this subject?')) deleteSubject(id); };

function renderSubjectsList() {
  var container = document.getElementById('subjects-list');
  if (!container) return;
  if (!state.subjects.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-text">Add your first subject</div></div>';
    return;
  }
  container.innerHTML = state.subjects.map(function(s) {
    var color    = SUBJECT_COLORS[s.colorIdx % SUBJECT_COLORS.length];
    var sc       = { weak:'strength-weak', strong:'strength-strong', neutral:'strength-neutral' }[s.strength] || 'strength-neutral';
    var stLabel  = { weak:'Weak', strong:'Strong', neutral:'Neutral' }[s.strength] || 'Neutral';
    var totalMins = state.sessions.filter(function(ss) { return ss.subject === s.name; })
                       .reduce(function(a, ss) { return a + (ss.duration || 0); }, 0);
    var hrs = (totalMins / 60).toFixed(1);
    return '<div class="subject-item">' +
      '<div class="subject-dot" style="background:' + color + '"></div>' +
      '<div style="flex:1"><div class="subject-name">' + s.name + '</div>' +
      '<div class="subject-info">' + hrs + 'h total</div></div>' +
      '<span class="subject-strength ' + sc + '">' + stLabel + '</span>' +
      '<div class="subject-actions">' +
      '<button class="btn btn-ghost btn-icon btn-sm" onclick="editSubj(\'' + s.id + '\')">✏️</button>' +
      '<button class="btn btn-danger btn-icon btn-sm" onclick="delSubj(\'' + s.id + '\')">🗑️</button>' +
      '</div></div>';
  }).join('');
}

function populateSubjectPicker() {
  var sel = document.getElementById('subject-select');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = state.subjects.length
    ? '<option value="" disabled' + (!cur ? ' selected' : '') + '>Choose subject…</option>' +
      state.subjects.map(function(s) {
        return '<option value="' + s.name + '"' + (s.name === cur ? ' selected' : '') + '>' + s.name + '</option>';
      }).join('')
    : '<option value="" disabled selected>Add subjects first</option>';
}

// ── TODOS ─────────────────────────────────────────────────────────────────────
function checkDailyReset() {
  var lastDate = LS.get('sscx_last_date', null);
  var today = TODAY();
  if (lastDate !== today) {
    var modified = false;
    state.todos.forEach(function(t) {
      if (t.type === 'daily' && t.status === 'completed') {
        t.status = 'pending';
        fbSet('todos', t.id, { status: 'pending' });
        modified = true;
      }
    });
    if (modified) saveTodosLS();
    LS.set('sscx_last_date', today);
  }
}

function bindTodos() {
  var btnAdd = document.getElementById('btn-add-task');
  if(btnAdd) btnAdd.addEventListener('click', openTaskModal);
  var btnSave = document.getElementById('btn-save-task');
  if(btnSave) btnSave.addEventListener('click', saveTask);
  var btnCancel = document.getElementById('btn-cancel-task');
  if(btnCancel) btnCancel.addEventListener('click', closeTaskModal);
  var overlay = document.getElementById('task-modal-overlay');
  if(overlay) overlay.addEventListener('click', function(e) {
    if (e.target.id === 'task-modal-overlay') closeTaskModal();
  });
}

window.switchTaskTab = function(type) {
  state.taskTab = type;
  document.querySelectorAll('.analytics-tab[data-tab^="tasks-"]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === 'tasks-' + type);
  });
  renderTasks();
}

function openTaskModal() {
  document.getElementById('modal-task-title').value = '';
  document.getElementById('modal-task-priority').value = 'Medium';
  document.getElementById('modal-task-type').value = state.taskTab;
  document.getElementById('task-modal-overlay').classList.add('show');
  setTimeout(function() { document.getElementById('modal-task-title').focus(); }, 100);
}
function closeTaskModal() { document.getElementById('task-modal-overlay').classList.remove('show'); }

function saveTask() {
  var title = document.getElementById('modal-task-title').value.trim();
  var priority = document.getElementById('modal-task-priority').value;
  var type = document.getElementById('modal-task-type').value;
  if (!title) { showToast('Enter task title'); return; }
  
  var newTask = {
    id: 't_' + Date.now(),
    title: title,
    priority: priority,
    type: type,
    status: 'pending',
    createdAt: Date.now()
  };
  state.todos.push(newTask);
  saveTodosLS();
  fbAdd('todos', newTask).then(function(id) { if(id) { newTask.id = id; saveTodosLS(); } });
  
  closeTaskModal();
  if (state.taskTab !== type) switchTaskTab(type);
  else renderTasks();
}

window.toggleTask = function(id, el) {
  var task = state.todos.find(function(t) { return t.id === id; });
  if (!task) return;
  
  var isCompleting = task.status !== 'completed';
  task.status = isCompleting ? 'completed' : 'pending';
  saveTodosLS();
  fbSet('todos', id, { status: task.status });
  
  if (isCompleting) {
    var card = el.closest('.task-card');
    if(card) {
      card.classList.add('anim-success-pop');
      spawnConfetti(el);
      setTimeout(function() { renderTasks(); }, 500);
      return;
    }
  }
  renderTasks();
}

window.deleteTask = function(id) {
  state.todos = state.todos.filter(function(t) { return t.id !== id; });
  saveTodosLS();
  fbDelete('todos', id);
  renderTasks();
  showToast('Task removed');
}

function renderTasks() {
  var container = document.getElementById('tasks-list');
  if (!container) return;
  var filtered = state.todos.filter(function(t) { return t.type === state.taskTab; });
  var pending = filtered.filter(function(t) { return t.status !== 'completed'; });
  var completed = filtered.filter(function(t) { return t.status === 'completed'; });
  var all = pending.concat(completed);
  
  if (!all.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">No ' + state.taskTab + ' tasks</div></div>';
    return;
  }
  
  container.innerHTML = all.map(function(t) {
    var checked = t.status === 'completed' ? 'checked' : '';
    var classes = checked ? 'task-card completed' : 'task-card';
    return '<div class="' + classes + ' priority-' + t.priority + '">' +
      '<input type="checkbox" class="task-checkbox" ' + checked + ' onchange="toggleTask(\'' + t.id + '\', this)">' +
      '<div class="task-content">' +
        '<div class="task-title">' + t.title + '</div>' +
        '<div class="task-meta">' +
          '<span class="task-badge badge-' + t.type + '">' + t.type + '</span>' +
          '<span>' + t.priority + ' Priority</span>' +
        '</div>' +
      '</div>' +
      '<div class="task-actions">' +
        '<button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTask(\'' + t.id + '\')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function spawnConfetti(el) {
  var cont = document.getElementById('confetti-container');
  if(!cont) return;
  var rect = el.getBoundingClientRect();
  for(var i=0; i<10; i++) {
    var c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = (rect.left + 5 + Math.random()*15) + 'px';
    c.style.top = (rect.top + 5 + Math.random()*15) + 'px';
    c.style.background = ['#22c55e', '#eab308', '#6366f1', '#06b6d4', '#f97316'][Math.floor(Math.random()*5)];
    cont.appendChild(c);
    (function(elNode){ setTimeout(function() { if(elNode.parentNode) elNode.parentNode.removeChild(elNode); }, 1500); })(c);
  }
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
function renderDashboard() {
  renderStreakCard();
  renderTodayStats();
  renderWeeklyBarChart();
  renderTargetBar();
}

function todayMinutes() {
  return state.sessions.filter(function(s) { return s.date === TODAY(); })
                       .reduce(function(a, s) { return a + (s.duration || 0); }, 0);
}
function todayHours() { return todayMinutes() / 60; }
function todaySessions() { return state.sessions.filter(function(s) { return s.date === TODAY(); }); }

function renderTodayStats() {
  var hrs  = todayHours();
  var mins = todayMinutes();
  setEl('dash-today-hrs',  hrs.toFixed(1) + 'h');
  setEl('dash-sessions',   todaySessions().length);
  setEl('dash-today-mins', mins + ' min');
  var weekMins = getLastNDays(7).reduce(function(a, d) { return a + dayMinutes(d); }, 0);
  setEl('dash-week-hrs', (weekMins / 60).toFixed(1) + 'h');
  var badge = document.getElementById('dash-perf-badge');
  if (badge) {
    if      (hrs >= 6) { badge.textContent = '🟢 Excellent'; badge.className = 'stat-badge badge-green'; }
    else if (hrs >= 4) { badge.textContent = '🟡 Good';      badge.className = 'stat-badge badge-yellow'; }
    else               { badge.textContent = '🔴 Below target'; badge.className = 'stat-badge badge-red'; }
  }
}

function renderStreakCard() {
  var streak = calcStreak();
  setEl('streak-num', streak);
  setEl('streak-sub', streak === 0 ? 'Start today!' : streak === 1 ? 'Good start – keep going!' : streak + ' days in a row 🔥');
}

function calcStreak() {
  var streak = 0;
  var d = new Date();
  while (true) {
    var dStr = d.toISOString().slice(0, 10);
    var worked = state.sessions.some(function(s) { return s.date === dStr && s.duration >= 1; });
    if (!worked) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getLastNDays(n) {
  var days = [];
  var d = new Date();
  for (var i = 0; i < n; i++) {
    days.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return days;
}
function dayMinutes(dateStr) {
  return state.sessions.filter(function(s) { return s.date === dateStr; })
                       .reduce(function(a, s) { return a + (s.duration || 0); }, 0);
}

function renderWeeklyBarChart() {
  var ctx = document.getElementById('chart-week-dash');
  if (!ctx) return;
  var days   = getLastNDays(7);
  var labels = days.map(function(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' }); });
  var data   = days.map(function(d) { return +(dayMinutes(d) / 60).toFixed(2); });
  if (charts.weekDash) { charts.weekDash.destroy(); }
  charts.weekDash = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ data: data,
        backgroundColor: data.map(function(v) { return v >= 6 ? 'rgba(34,197,94,0.75)' : v >= 4 ? 'rgba(234,179,8,0.75)' : 'rgba(99,102,241,0.75)'; }),
        borderRadius: 8, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return c.parsed.y.toFixed(1) + 'h'; } }, backgroundColor:'rgba(19,19,31,0.95)', titleColor:'#94a3b8', bodyColor:'#f1f5f9', borderColor:'rgba(255,255,255,0.1)', borderWidth:1 } },
      scales: {
        x: { grid: { display: false }, ticks: { color:'#475569', font:{ size:11 } } },
        y: { grid: { color:'rgba(255,255,255,0.04)' }, ticks: { color:'#475569', font:{ size:11 }, callback: function(v){ return v+'h'; } }, min:0 }
      },
      animation: { duration:800, easing:'easeOutQuart' }
    }
  });
}

function renderTargetBar() {
  var hrs  = todayHours();
  var pct  = Math.min((hrs / 8) * 100, 100);
  var fill = document.getElementById('target-bar-fill');
  var act  = document.getElementById('target-actual');
  if (fill) fill.style.width = pct + '%';
  if (act)  act.textContent  = hrs.toFixed(1) + 'h today';
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
function bindAnalyticsTabs() {
  document.querySelectorAll('.analytics-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.analytics-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.chart-section').forEach(function(s) { s.classList.remove('active'); });
      tab.classList.add('active');
      var section = document.getElementById('section-' + tab.dataset.tab);
      if (section) section.classList.add('active');
      state.analyticsTab = tab.dataset.tab;
      renderActiveAnalytics();
    });
  });
}
function renderAnalytics() { renderActiveAnalytics(); }
function renderActiveAnalytics() {
  var t = state.analyticsTab;
  if (t === 'week')     renderWeekAnalytics();
  if (t === 'monthly')  renderMonthlyAnalytics();
  if (t === 'subjects') renderSubjectPie();
}

function renderWeekAnalytics() {
  var ctx = document.getElementById('chart-week');
  if (!ctx) return;
  var days   = getLastNDays(7);
  var labels = days.map(function(d) { return new Date(d+'T00:00:00').toLocaleDateString('en',{weekday:'short',day:'numeric'}); });
  var hrs    = days.map(function(d) { return +(dayMinutes(d)/60).toFixed(2); });
  if (charts.week) { charts.week.destroy(); }
  charts.week = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label:'Actual', data:hrs, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)', pointBackgroundColor:'#818cf8', pointRadius:5, pointHoverRadius:7, fill:true, tension:0.4 },
      { label:'Target (6h)', data:Array(7).fill(6), borderColor:'rgba(234,179,8,0.5)', borderDash:[6,4], pointRadius:0, fill:false }
    ]},
    options: chartLineOpts()
  });
  // perf rows
  var container = document.getElementById('perf-rows');
  if (container) {
    container.innerHTML = days.slice().reverse().map(function(d) {
      var h  = +(dayMinutes(d)/60).toFixed(1);
      var color = h>=6 ? '#22c55e' : h>=4 ? '#eab308' : '#6366f1';
      var pct   = Math.min((h/8)*100,100);
      var dt    = new Date(d+'T00:00:00').toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});
      return '<div class="perf-row"><span class="perf-date">'+dt+'</span><div class="perf-bar-wrap"><div class="perf-bar-inner" style="width:'+pct+'%;background:'+color+'"></div></div><span class="perf-hours" style="color:'+color+'">'+h+'h</span></div>';
    }).join('');
  }
}

function renderMonthlyAnalytics() {
  var ctx = document.getElementById('chart-monthly');
  if (!ctx) return;
  var days = getLastNDays(28);
  var weeks = [0,1,2,3].map(function(i) {
    var chunk = days.slice(i*7,(i+1)*7);
    return { label:'Week '+(i+1), hours: +(chunk.reduce(function(a,d){return a+dayMinutes(d);},0)/60).toFixed(2) };
  });
  if (charts.monthly) { charts.monthly.destroy(); }
  charts.monthly = new Chart(ctx, {
    type:'bar',
    data:{ labels:weeks.map(function(w){return w.label;}),
      datasets:[
        { label:'Hours', data:weeks.map(function(w){return w.hours;}), backgroundColor:'rgba(6,182,212,0.75)', borderRadius:10, borderSkipped:false },
        { label:'Target (42h)', data:[42,42,42,42], type:'line', borderColor:'rgba(234,179,8,0.6)', borderDash:[6,4], pointRadius:0, fill:false }
      ]},
    options: chartLineOpts()
  });
}

function renderSubjectPie() {
  var ctx = document.getElementById('chart-subjects');
  if (!ctx) return;
  var totals = state.subjects.map(function(s) {
    return { name:s.name, mins:state.sessions.filter(function(ss){return ss.subject===s.name;}).reduce(function(a,ss){return a+(ss.duration||0);},0), color:SUBJECT_COLORS[s.colorIdx%SUBJECT_COLORS.length] };
  }).filter(function(s){return s.mins>0;});

  if (!totals.length) {
    ctx.parentElement.innerHTML='<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No study data yet</div></div>';
    return;
  }
  if (charts.subjects) { charts.subjects.destroy(); }
  charts.subjects = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:totals.map(function(s){return s.name;}),
      datasets:[{ data:totals.map(function(s){return Math.round(s.mins/60*10)/10;}), backgroundColor:totals.map(function(s){return s.color;}), borderWidth:0, hoverOffset:12 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:12}, boxWidth:12, padding:16 } },
        tooltip:{ callbacks:{ label:function(c){return ' '+c.label+': '+c.parsed+'h';} }, backgroundColor:'rgba(19,19,31,0.95)', titleColor:'#94a3b8', bodyColor:'#f1f5f9', borderColor:'rgba(255,255,255,0.1)', borderWidth:1 } },
      animation:{ duration:800, easing:'easeOutQuart' }
    }
  });
}

function chartLineOpts() {
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{ intersect:false, mode:'index' },
    plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:12}, boxWidth:12 } },
      tooltip:{ backgroundColor:'rgba(19,19,31,0.95)', titleColor:'#94a3b8', bodyColor:'#f1f5f9', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, callbacks:{ label:function(c){return ' '+c.dataset.label+': '+c.parsed.y.toFixed(1)+'h';} } } },
    scales:{
      x:{ grid:{ display:false }, ticks:{ color:'#475569', font:{size:10} } },
      y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#475569', font:{size:11}, callback:function(v){return v+'h';} }, min:0 }
    },
    animation:{ duration:900, easing:'easeOutQuart' }
  };
}

// ── TARGETS ───────────────────────────────────────────────────────────────────
function renderTargets() {
  var now = new Date();
  var daysToDeadline = Math.ceil((SYLLABUS_DEADLINE - now) / 86400000);
  var daysToExam     = Math.ceil((EXAM_DATE - now) / 86400000);
  var weeksToDead    = Math.floor(daysToDeadline / 7);
  setEl('days-to-deadline', daysToDeadline);
  setEl('weeks-to-deadline', weeksToDead);
  setEl('days-to-exam', daysToExam);

  var studiedHrs    = state.sessions.reduce(function(a,s){return a+(s.duration||0);},0) / 60;
  var totalNeeded   = daysToDeadline * 6;
  var remaining     = Math.max(totalNeeded - studiedHrs, 0);
  var reqHrs        = daysToDeadline > 0 ? (remaining / daysToDeadline).toFixed(1) : '0';
  setEl('req-daily-hrs', reqHrs + 'h');
  setEl('total-studied', studiedHrs.toFixed(1) + 'h');

  var days = getLastNDays(7);
  var container = document.getElementById('target-perf-list');
  if (container) {
    container.innerHTML = days.slice().reverse().map(function(d) {
      var h     = +(dayMinutes(d)/60).toFixed(1);
      var color = h>=6 ? '#22c55e' : h>=4 ? '#eab308' : '#ef4444';
      var icon  = h>=6 ? '🟢' : h>=4 ? '🟡' : '🔴';
      var dt    = new Date(d+'T00:00:00').toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});
      return '<div class="perf-row"><span class="perf-date">'+icon+' '+dt+'</span><span class="perf-hours" style="color:'+color+'">'+h+'h</span></div>';
    }).join('');
  }
}

// ── RENDER ALL ────────────────────────────────────────────────────────────────
function renderAll() {
  populateSubjectPicker();
  renderRecentSessions();
  renderSubjectsList();
  renderDashboard();
  renderTasks();
  // activate default tab
  var page = document.getElementById('page-' + state.tab);
  if (page) page.classList.add('active');
  var navBtn = document.querySelector('.nav-btn[data-tab="' + state.tab + '"]');
  if (navBtn) navBtn.classList.add('active');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function setEl(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }

var toastTimer = null;
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2800);
}
