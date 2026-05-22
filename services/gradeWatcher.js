const db = require('../db');

const stmts = {
  getGrade: db.prepare(`SELECT grade, score FROM assignments WHERE id = ?`),
  notify:   db.prepare(`
    INSERT INTO notifications (type, assignment_id, message, created_at)
    VALUES (@type, @assignmentId, @message, @now)
  `)
};

function check(assignments) {
  const now = new Date().toISOString();
  const notifications = [];

  for (const a of assignments) {
    const stored = stmts.getGrade.get(String(a.id));
    if (!stored) continue; // new assignment — assignmentWatcher handles it

    const gradeChanged = a.grade != null && a.grade !== stored.grade;
    const scoreChanged = a.score != null && a.score !== stored.score;
    if (!gradeChanged && !scoreChanged) continue;

    const wasUngraded = stored.grade == null && stored.score == null;
    const newValue = a.grade ?? String(a.score);
    const oldValue = stored.grade ?? String(stored.score);

    const message = wasUngraded
      ? `Grade posted for "${a.name}" in ${a.courseName}: ${newValue}`
      : `Grade updated for "${a.name}" in ${a.courseName}: ${oldValue} → ${newValue}`;

    stmts.notify.run({ type: 'grade_posted', assignmentId: String(a.id), message, now });
    notifications.push({ type: 'grade_posted', assignmentId: String(a.id), message });
  }

  return notifications;
}

module.exports = { check };
