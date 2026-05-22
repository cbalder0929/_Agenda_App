const db = require('../db');

const NOTIFY = `
  INSERT INTO notifications (type, assignment_id, message, created_at)
  VALUES ($1, $2, $3, $4)
`;

async function alreadyNotified(type, assignmentId) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM notifications WHERE type = $1 AND assignment_id = $2',
    [type, assignmentId]
  );
  return rowCount > 0;
}

async function checkDeadlines() {
  const now = new Date();
  const { rows: assignments } = await db.query(
    `SELECT * FROM assignments WHERE due_at IS NOT NULL AND is_turned_in = 0`
  );
  let created = 0;

  for (const a of assignments) {
    const msUntil = new Date(a.due_at) - now;

    if (msUntil < 0) {
      // Past due — fire once
      if (!(await alreadyNotified('overdue', a.id))) {
        await db.query(NOTIFY, [
          'overdue',
          a.id,
          `"${a.name}" in ${a.course_name} is overdue`,
          now.toISOString(),
        ]);
        created++;
      }
    } else if (msUntil <= 3 * 3600_000) {
      // Within 3 hours — fire once (escalates past the 24h alert)
      if (!(await alreadyNotified('deadline_3h', a.id))) {
        await db.query(NOTIFY, [
          'deadline_3h',
          a.id,
          `"${a.name}" in ${a.course_name} is due in less than 3 hours`,
          now.toISOString(),
        ]);
        created++;
      }
    } else if (msUntil <= 24 * 3600_000) {
      // Within 24 hours — fire once
      if (!(await alreadyNotified('deadline_soon', a.id))) {
        await db.query(NOTIFY, [
          'deadline_soon',
          a.id,
          `"${a.name}" in ${a.course_name} is due in less than 24 hours`,
          now.toISOString(),
        ]);
        created++;
      }
    }
  }

  if (created) console.log(`[scheduler] ${created} deadline notification(s) created`);
}

function runCheck() {
  checkDeadlines().catch((error) => {
    console.error('[scheduler] Deadline check failed:', error.message);
  });
}

function start(intervalMs = 15 * 60 * 1000) {
  runCheck();
  setInterval(runCheck, intervalMs);
  console.log(`[scheduler] Running deadline checks every ${intervalMs / 60000} min`);
}

module.exports = { start, checkDeadlines };
