const db = require('../db');

const stmts = {
  exists: db.prepare(`SELECT 1 FROM assignments WHERE id = ?`),

  upsert: db.prepare(`
    INSERT INTO assignments
      (id, course_id, course_name, name, due_at, created_at, points_possible,
       submission_type, grade, score, is_turned_in, first_seen_at, updated_at)
    VALUES
      (@id, @courseId, @courseName, @name, @dueAt, @createdAt, @pointsPossible,
       @submissionType, @grade, @score, @isTurnedIn, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      grade        = excluded.grade,
      score        = excluded.score,
      is_turned_in = excluded.is_turned_in,
      updated_at   = excluded.updated_at
  `),

  notify: db.prepare(`
    INSERT INTO notifications (type, assignment_id, message, created_at)
    VALUES (@type, @assignmentId, @message, @now)
  `)
};

const syncAll = db.transaction((assignments, now) => {
  const created = [];

  for (const a of assignments) {
    const isNew = !stmts.exists.get(String(a.id));

    stmts.upsert.run({
      id:             String(a.id),
      courseId:       String(a.courseId),
      courseName:     a.courseName,
      name:           a.name,
      dueAt:          a.dueAt,
      createdAt:      a.createdAt,
      pointsPossible: a.pointsPossible,
      submissionType: a.submissionType,
      grade:          a.grade,
      score:          a.score,
      isTurnedIn:     a.isTurnedIn ? 1 : 0,
      now
    });

    if (isNew) {
      const dueLabel = a.dueAt
        ? ` — due ${new Date(a.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : '';
      const message = `New assignment: "${a.name}" in ${a.courseName}${dueLabel}`;

      stmts.notify.run({ type: 'new_assignment', assignmentId: String(a.id), message, now });
      created.push({ type: 'new_assignment', assignmentId: String(a.id), message });
    }
  }

  return created;
});

function sync(assignments) {
  return syncAll(assignments, new Date().toISOString());
}

module.exports = { sync };
