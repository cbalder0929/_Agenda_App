const db = require('../db');

const stmts = {
  pending: db.prepare(`
    SELECT * FROM assignments
    WHERE due_at IS NOT NULL AND is_turned_in = 0
  `),
  hasNotif: db.prepare(`
    SELECT 1 FROM notifications WHERE type = ? AND assignment_id = ?
  `),
  notify: db.prepare(`
    INSERT INTO notifications (type, assignment_id, message, created_at)
    VALUES (@type, @assignmentId, @message, @now)
  `)
};

function checkDeadlines() {
  const now = new Date();
  const assignments = stmts.pending.all();
  let created = 0;

  for (const a of assignments) {
    const msUntil = new Date(a.due_at) - now;

    if (msUntil < 0) {
      // Past due — fire once
      if (!stmts.hasNotif.get('overdue', a.id)) {
        stmts.notify.run({
          type: 'overdue',
          assignmentId: a.id,
          message: `"${a.name}" in ${a.course_name} is overdue`,
          now: now.toISOString()
        });
        created++;
      }
    } else if (msUntil <= 3 * 3600_000) {
      // Within 3 hours — fire once (escalates past the 24h alert)
      if (!stmts.hasNotif.get('deadline_3h', a.id)) {
        stmts.notify.run({
          type: 'deadline_3h',
          assignmentId: a.id,
          message: `"${a.name}" in ${a.course_name} is due in less than 3 hours`,
          now: now.toISOString()
        });
        created++;
      }
    } else if (msUntil <= 24 * 3600_000) {
      // Within 24 hours — fire once
      if (!stmts.hasNotif.get('deadline_soon', a.id)) {
        stmts.notify.run({
          type: 'deadline_soon',
          assignmentId: a.id,
          message: `"${a.name}" in ${a.course_name} is due in less than 24 hours`,
          now: now.toISOString()
        });
        created++;
      }
    }
  }

  if (created) console.log(`[scheduler] ${created} deadline notification(s) created`);
}

function start(intervalMs = 15 * 60 * 1000) {
  checkDeadlines();
  setInterval(checkDeadlines, intervalMs);
  console.log(`[scheduler] Running deadline checks every ${intervalMs / 60000} min`);
}

module.exports = { start, checkDeadlines };
