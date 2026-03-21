const DOMAIN = 'canvas.colum.edu';
const PROXY_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3001' : window.location.origin;
const BASE = `${PROXY_BASE}/proxy/api/v1`;
let allAssignments = [];
let courses = {};
let activeFilter = 'all';
let activeCourse = 'all';

async function fetchAll(url) {
  let results = [];
  let next = url;
  while (next) {
    const fetchUrl = next.startsWith(`https://${DOMAIN}`) ? next.replace(`https://${DOMAIN}`, `${PROXY_BASE}/proxy`) : next;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    results = results.concat(data);
    const link = res.headers.get('Link') || '';
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    next = match ? match[1] : null;
  }
  return results;
}

async function load() {
  try {
    // Get active courses
    const courseList = await fetchAll(`${BASE}/courses?enrollment_state=active&include[]=total_scores&per_page=50`);
    courseList.forEach(c => { if (c.name) courses[c.id] = c; });

    // Populate course filter
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
      if (c.enrollments && c.enrollments.length > 0 && c.enrollments[0].computed_current_score != null) {
        grade = c.enrollments[0].computed_current_score + '%';
      } else if (c.enrollments && c.enrollments.length > 0 && c.enrollments[0].computed_current_grade != null) {
        grade = c.enrollments[0].computed_current_grade;
      }
      const card = document.createElement('div');
      card.className = 'stat-card course-card';
      card.dataset.id = c.id;
      card.innerHTML = `<div class="stat-grade-label">Current Grade</div><div class="stat-num">${grade}</div><div class="stat-label" title="${escHtml(c.name)}">${escHtml(c.name)}</div>`;
      card.addEventListener('click', () => {
        if (activeCourse === String(c.id)) {
          activeCourse = 'all';
          document.getElementById('course-select').value = 'all';
        } else {
          activeCourse = String(c.id);
          document.getElementById('course-select').value = c.id;
        }
        render(); // This will re-render assignments and update active states
      });
      coursesRow.appendChild(card);
    });

    // Get assignments per course
    const promises = courseList.filter(c => c.name).map(c =>
      fetchAll(`${BASE}/courses/${c.id}/assignments?per_page=50&order_by=due_at&include[]=submission`)
        .then(list => list.map(a => ({ ...a, _course: c })))
        .catch(() => [])
    );
    const nested = await Promise.all(promises);
    allAssignments = nested.flat();

    render();
  } catch (err) {
    showError(err.message);
  }
}

function classifyDue(dueStr) {
  if (!dueStr) return 'no-date';
  const due = new Date(dueStr);
  const now = new Date();
  const diff = due - now;
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

function render() {
  const search = document.getElementById('search').value.toLowerCase();

  let filtered = allAssignments.filter(a => {
    if (activeCourse !== 'all' && String(a.course_id) !== activeCourse) return false;
    if (search && !a.name.toLowerCase().includes(search) && !(a._course?.name || '').toLowerCase().includes(search)) return false;
    const cls = classifyDue(a.due_at);
    if (activeFilter === 'upcoming') return cls === 'upcoming' || cls === 'soon';
    if (activeFilter === 'overdue') return cls === 'overdue';
    if (activeFilter === 'no-date') return cls === 'no-date';
    return true;
  });

  // Sort: overdue first, then by due date, then no-date
  filtered.sort((a, b) => {
    const ca = classifyDue(a.due_at), cb = classifyDue(b.due_at);
    if (ca === 'no-date' && cb !== 'no-date') return 1;
    if (cb === 'no-date' && ca !== 'no-date') return -1;
    if (!a.due_at && !b.due_at) return 0;
    return new Date(a.due_at) - new Date(b.due_at);
  });

  // Sync active state of course cards
  document.querySelectorAll('.course-card').forEach(card => {
    if (card.dataset.id === activeCourse) {
      card.classList.add('active-course');
    } else {
      card.classList.remove('active-course');
    }
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

  // Group by overdue / this week / upcoming / no date
  const groups = { 'Overdue': [], 'Due this week': [], 'Upcoming': [], 'No due date': [] };
  filtered.forEach(a => {
    const cls = classifyDue(a.due_at);
    if (cls === 'overdue') groups['Overdue'].push(a);
    else if (cls === 'soon') groups['Due this week'].push(a);
    else if (cls === 'upcoming') groups['Upcoming'].push(a);
    else groups['No due date'].push(a);
  });

  let html = '';
  Object.entries(groups).forEach(([label, items]) => {
    if (!items.length) return;
    html += `<div class="section-label">${label} · ${items.length}</div>`;
    items.forEach(a => {
      const cls = classifyDue(a.due_at);
      const due = formatDue(a.due_at);
      const courseName = a._course?.name || 'Unknown course';
      const points = a.points_possible != null ? `${a.points_possible} pts` : null;
      const type = a.submission_types?.[0]?.replace(/_/g, ' ') || '';
      const url = `https://${DOMAIN}/courses/${a.course_id}/assignments/${a.id}`;

      let statusTag = '';
      if (cls === 'overdue') statusTag = `<span class="tag tag-overdue">overdue</span>`;
      else if (cls === 'soon') statusTag = `<span class="tag tag-soon">due soon</span>`;
      else if (cls === 'upcoming') statusTag = `<span class="tag tag-upcoming">upcoming</span>`;
      else statusTag = `<span class="tag tag-no-date">no date</span>`;

      const dayColor = cls === 'overdue' ? 'var(--danger)' : cls === 'soon' ? 'var(--warning)' : 'var(--text)';

      let isTurnedIn = false;
      if (a.submission) {
        const state = a.submission.workflow_state;
        isTurnedIn = (state === 'submitted' || state === 'graded' || state === 'pending_review');
      }
      
      const turnInTag = isTurnedIn 
        ? `<span class="tag tag-turned-in">✓ Turned in</span>` 
        : `<span class="tag tag-not-turned-in">Not turned in</span>`;

      html += `
        <div class="assignment-card">
          <div class="due-section">
            <div class="due-badge">
              <div class="due-month">${due.month}</div>
              <div class="due-day" style="color:${dayColor}">${due.day}</div>
              <div class="due-time">${due.time}</div>
            </div>
            <a class="open-link" href="${url}" target="_blank">open ↗</a>
          </div>
          <div class="assignment-info">
            <div class="assignment-name">${escHtml(a.name)}</div>
            <div class="assignment-course">${escHtml(courseName)}</div>
            <div class="assignment-meta">
              ${turnInTag}
              ${statusTag}
              ${points ? `<span class="tag tag-points">${points}</span>` : ''}
              ${type ? `<span class="tag tag-type">${escHtml(type)}</span>` : ''}
            </div>
          </div>
        </div>`;
    });
  });

  container.innerHTML = html;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = `Error: ${msg}. Check that your token has the right permissions or try logging in to Canvas again.`;
  el.style.display = 'block';
  document.getElementById('list-container').innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Could not load assignments</h3><p>${escHtml(msg)}</p></div>`;
}

// Events
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

load();
