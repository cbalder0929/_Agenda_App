const DOMAIN = 'canvas.colum.edu';
const PROXY_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3001' : window.location.origin;
const BASE = `${PROXY_BASE}/proxy/api/v1`;
let allAssignments = [];
let courses = {};
let activeFilter = 'all';
let activeCourse = 'all';

// ── Utilities ────────────────────────────────────────────────────────────────

function classifyDue(dueStr) {
  if (!dueStr) return 'no-date';
  const diff = new Date(dueStr) - new Date();
  if (diff < 0) return 'overdue';
  if (diff < 7 * 86400000) return 'soon';
  return 'upcoming';
}

function formatDue(dueStr) {
  if (!dueStr) return { month: '—', day: '—', time: '' };
  const d = new Date(dueStr);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    time: d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  };
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreToGpaPoints(score) {
  if (score >= 93) return 4.0;
  if (score >= 90) return 3.7;
  if (score >= 87) return 3.3;
  if (score >= 83) return 3.0;
  if (score >= 80) return 2.7;
  if (score >= 77) return 2.3;
  if (score >= 73) return 2.0;
  if (score >= 70) return 1.7;
  if (score >= 67) return 1.3;
  if (score >= 63) return 1.0;
  if (score >= 60) return 0.7;
  return 0.0;
}

function scoreToLetterGrade(score) {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

// ── Data normalization ────────────────────────────────────────────────────────

function normalizeAssignment(raw) {
  const sub = raw.submission || {};
  const state = sub.workflow_state;
  const comments = sub.submission_comments || [];
  const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;

  const score = sub.score ?? null;
  const pointsPossible = raw.points_possible ?? null;
  const percentage = (score != null && pointsPossible > 0)
    ? Math.round((score / pointsPossible) * 100)
    : null;

  return {
    id: raw.id,
    name: raw.name,
    courseId: raw.course_id,
    courseName: raw._course?.name || 'Unknown course',
    dueAt: raw.due_at || null,
    createdAt: raw.created_at || null,
    description: raw.description || null,
    dueStatus: classifyDue(raw.due_at),
    dueFormatted: formatDue(raw.due_at),
    isTurnedIn: state === 'submitted' || state === 'graded' || state === 'pending_review',
    grade: sub.grade ?? null,
    score,
    pointsPossible,
    percentage,
    submissionType: raw.submission_types?.[0]?.replace(/_/g, ' ') || '',
    feedback: latestComment?.comment || null,
    url: `https://${DOMAIN}/courses/${raw.course_id}/assignments/${raw.id}`
  };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchAll(url) {
  let results = [];
  let next = url;
  while (next) {
    const fetchUrl = next.startsWith(`https://${DOMAIN}`)
      ? next.replace(`https://${DOMAIN}`, `${PROXY_BASE}/proxy`)
      : next;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    results = results.concat(await res.json());
    const link = res.headers.get('Link') || '';
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    next = match ? match[1] : null;
  }
  return results;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  try {
    const courseList = await fetchAll(`${BASE}/courses?enrollment_state=active&include[]=total_scores&include[]=term&per_page=50`);
    courseList.forEach(c => { if (c.name) courses[c.id] = c; });

    const semester = courseList[0]?.term?.name || 'Spring 2026';
    document.querySelector('.si-semester').textContent = semester;

    const gpaPoints = courseList
      .filter(c => c.name && c.enrollments?.[0]?.computed_current_score != null)
      .map(c => scoreToGpaPoints(c.enrollments[0].computed_current_score));
    document.getElementById('si-gpa').textContent = gpaPoints.length
      ? 'GPA ' + (gpaPoints.reduce((s, v) => s + v, 0) / gpaPoints.length).toFixed(2)
      : 'GPA —';

    fetch(`${BASE}/users/self/profile`)
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p) document.getElementById('si-name').innerHTML = escHtml(p.name || p.short_name || ''); })
      .catch(() => {});

    const sel = document.getElementById('course-select');
    courseList.filter(c => c.name).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name.length > 40 ? c.name.slice(0, 40) + '…' : c.name;
      sel.appendChild(opt);
    });

    const coursesRow = document.getElementById('courses-row');
    courseList.filter(c => c.name).forEach(c => {
      let grade = 'N/A';
      const enroll = c.enrollments?.[0];
      if (enroll?.computed_current_score != null) grade = scoreToLetterGrade(enroll.computed_current_score);
      else if (enroll?.computed_current_grade != null) grade = enroll.computed_current_grade;

      const card = document.createElement('div');
      card.className = 'stat-card course-card';
      card.dataset.id = c.id;
      card.innerHTML = `<div class="stat-grade-label">Current Grade</div><div class="stat-num">${grade}</div><div class="stat-label" title="${escHtml(c.name)}">${escHtml(c.name)}</div>`;
      card.addEventListener('click', () => {
        activeCourse = activeCourse === String(c.id) ? 'all' : String(c.id);
        document.getElementById('course-select').value = activeCourse;
        render();
      });
      coursesRow.appendChild(card);
    });

    const promises = courseList.filter(c => c.name).map(c =>
      fetchAll(`${BASE}/courses/${c.id}/assignments?per_page=50&order_by=due_at&include[]=submission&include[]=submission_comments`)
        .then(list => list.map(a => normalizeAssignment({ ...a, _course: c })))
        .catch(() => [])
    );
    allAssignments = (await Promise.all(promises)).flat();

    render();
    syncWithServer(allAssignments);
  } catch (err) {
    showError(err.message);
  }
}

async function syncWithServer(assignments) {
  try {
    await fetch(`${PROXY_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments })
    });
  } catch (_) {
    // non-critical — DB sync failure doesn't affect the UI
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search = document.getElementById('search').value.toLowerCase();

  let filtered = allAssignments.filter(a => {
    if (activeCourse !== 'all' && String(a.courseId) !== activeCourse) return false;
    if (search && !a.name.toLowerCase().includes(search) && !a.courseName.toLowerCase().includes(search)) return false;
    if (activeFilter === 'upcoming') return a.dueStatus === 'upcoming' || a.dueStatus === 'soon';
    if (activeFilter === 'overdue') return a.dueStatus === 'overdue';
    if (activeFilter === 'no-date') return a.dueStatus === 'no-date';
    return true;
  });

  filtered.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  document.querySelectorAll('.course-card').forEach(card => {
    card.classList.toggle('active-course', card.dataset.id === activeCourse);
  });

  const container = document.getElementById('list-container');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <h3>Nothing here</h3>
        <p>No assignments match this filter.</p>
      </div>`;
    return;
  }

  const groups = { 'Overdue': [], 'Due this week': [], 'Upcoming': [], 'No due date': [] };
  filtered.forEach(a => {
    if (a.dueStatus === 'overdue')       groups['Overdue'].push(a);
    else if (a.dueStatus === 'soon')     groups['Due this week'].push(a);
    else if (a.dueStatus === 'upcoming') groups['Upcoming'].push(a);
    else                                  groups['No due date'].push(a);
  });

  let html = '';
  Object.entries(groups).forEach(([label, items]) => {
    if (!items.length) return;
    html += `<div class="section-label">${label} · ${items.length}</div>`;
    items.forEach(a => {
      const dayColor = a.dueStatus === 'overdue' ? 'var(--danger)' : a.dueStatus === 'soon' ? 'var(--warning)' : 'var(--text)';

      const statusTag = {
        overdue:  `<span class="tag tag-overdue">overdue</span>`,
        soon:     `<span class="tag tag-soon">due soon</span>`,
        upcoming: `<span class="tag tag-upcoming">upcoming</span>`,
        'no-date':`<span class="tag tag-no-date">no date</span>`
      }[a.dueStatus];

      const turnInTag = a.isTurnedIn
        ? `<span class="tag tag-turned-in">✓ Turned in</span>`
        : `<span class="tag tag-not-turned-in">Not turned in</span>`;

      const gradeColor = a.percentage != null
        ? a.percentage >= 80 ? 'var(--success)' : a.percentage >= 60 ? 'var(--warning)' : 'var(--danger)'
        : 'var(--text)';

      const ptsLine = a.percentage == null && a.grade == null && a.pointsPossible != null
        ? `<div class="assignment-pts">${a.pointsPossible} pts possible</div>`
        : '';

      const gradeBlock = a.percentage != null
        ? `<div class="assignment-score">
             <div class="score-val" style="color:${gradeColor}">${a.percentage}%</div>
             <div class="score-sub">${a.score} / ${a.pointsPossible} pts</div>
           </div>`
        : a.grade != null
          ? `<div class="assignment-score"><div class="score-val">${escHtml(String(a.grade))}</div></div>`
          : '';

      const feedbackBlock = a.feedback
        ? `<div class="assignment-feedback">${escHtml(a.feedback)}</div>`
        : '';

      html += `
        <div class="assignment-card">
          <div class="due-section">
            <div class="due-badge">
              <div class="due-month">${a.dueFormatted.month}</div>
              <div class="due-day" style="color:${dayColor}">${a.dueFormatted.day}</div>
              <div class="due-time">${a.dueFormatted.time}</div>
            </div>
            <a class="open-link" href="${a.url}" target="_blank">open ↗</a>
          </div>
          <div class="assignment-info">
            <div class="assignment-name">${escHtml(a.name)}</div>
            ${ptsLine}
            <div class="assignment-course">${escHtml(a.courseName)}</div>
            <div class="assignment-meta">
              ${turnInTag}
              ${statusTag}
              ${a.submissionType ? `<span class="tag tag-type">${escHtml(a.submissionType)}</span>` : ''}
            </div>
            ${feedbackBlock}
          </div>
          ${gradeBlock}
        </div>`;
    });
  });

  container.innerHTML = html;
}

// ── Notifications ─────────────────────────────────────────────────────────────

const TYPE_LABEL = {
  new_assignment: 'New Assignment',
  grade_posted:   'Grade Posted',
  deadline_soon:  'Due in 24h',
  deadline_3h:    'Due in 3h',
  overdue:        'Overdue'
};

function relativeTime(isoStr) {
  const m = Math.floor((Date.now() - new Date(isoStr)) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function loadNotifications() {
  try {
    const res = await fetch(`${PROXY_BASE}/api/notifications`);
    const { notifications, unread } = await res.json();

    const badge = document.getElementById('notif-badge');
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.classList.toggle('visible', unread > 0);

    const list = document.getElementById('notif-list');
    if (!notifications.length) {
      list.innerHTML = '<div class="notif-empty">All caught up!</div>';
      return;
    }

    list.innerHTML = notifications.map(n => `
      <div class="notif-item${n.read ? '' : ' unread'}" data-id="${n.id}">
        <div class="notif-dot notif-dot-${n.type}"></div>
        <div class="notif-body">
          <div class="notif-type notif-type-${n.type}">${TYPE_LABEL[n.type] || n.type}</div>
          <div class="notif-msg">${escHtml(n.message)}</div>
          <div class="notif-time">${relativeTime(n.created_at)}</div>
        </div>
      </div>`).join('');

    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => markRead(Number(el.dataset.id)));
    });
  } catch (_) {}
}

async function markRead(id) {
  try {
    await fetch(`${PROXY_BASE}/api/notifications/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    loadNotifications();
  } catch (_) {}
}

async function markAllRead() {
  try {
    await fetch(`${PROXY_BASE}/api/notifications/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    loadNotifications();
  } catch (_) {}
}

document.getElementById('notif-btn').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const opening = panel.classList.toggle('open');
  if (opening) loadNotifications();
});

document.getElementById('notif-mark-all').addEventListener('click', e => {
  e.stopPropagation();
  markAllRead();
});

document.addEventListener('click', e => {
  if (!document.getElementById('notif-wrapper').contains(e.target)) {
    document.getElementById('notif-panel').classList.remove('open');
  }
});

// ── Error ─────────────────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = `Error: ${msg}. Check that your token has the right permissions or try logging in to Canvas again.`;
  el.style.display = 'block';
  document.getElementById('list-container').innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <h3>Could not load assignments</h3>
      <p>${escHtml(msg)}</p>
    </div>`;
}

// ── Events ────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    activeFilter = t.dataset.filter;
    render();
  });
});

document.getElementById('course-select').addEventListener('change', e => {
  activeCourse = e.target.value;
  render();
});

document.getElementById('search').addEventListener('input', render);

async function initGoogleCalendar() {
  const connectBtn = document.getElementById('gcal-connect-btn');
  const syncBtn = document.getElementById('gcal-sync-btn');
  const status = document.getElementById('gcal-status');

  try {
    const res = await fetch(`${PROXY_BASE}/api/calendar/status`);
    const { connected } = await res.json();
    connectBtn.style.display = connected ? 'none' : '';
    syncBtn.style.display = connected ? '' : 'none';
  } catch (_) {
    // non-critical — leave both buttons hidden if the check fails
  }

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    status.textContent = 'Syncing…';
    try {
      const res = await fetch(`${PROXY_BASE}/api/calendar/sync`, { method: 'POST' });
      const data = await res.json();
      status.textContent = res.ok
        ? `Synced — ${data.created} new, ${data.updated} updated`
        : `Error: ${data.error}`;
    } catch (err) {
      status.textContent = 'Sync failed';
    } finally {
      syncBtn.disabled = false;
    }
  });
}

load();
loadNotifications();
initGoogleCalendar();
