const db = require('../db');

const UPSERT = `
  INSERT INTO assignments
    (id, course_id, course_name, name, due_at, created_at, description, points_possible,
     submission_type, grade, score, is_turned_in, first_seen_at, updated_at)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
  ON CONFLICT (id) DO UPDATE SET
    description  = EXCLUDED.description,
    grade        = EXCLUDED.grade,
    score        = EXCLUDED.score,
    is_turned_in = EXCLUDED.is_turned_in,
    updated_at   = EXCLUDED.updated_at
`;

const NOTIFY = `
  INSERT INTO notifications (type, assignment_id, message, created_at)
  VALUES ($1, $2, $3, $4)
`;

async function sync(assignments) {
  const now = new Date().toISOString();
  const created = [];
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    for (const a of assignments) {
      const id = String(a.id);
      const existing = await client.query('SELECT 1 FROM assignments WHERE id = $1', [id]);
      const isNew = existing.rowCount === 0;

      await client.query(UPSERT, [
        id,
        String(a.courseId),
        a.courseName,
        a.name,
        a.dueAt,
        a.createdAt,
        a.description,
        a.pointsPossible,
        a.submissionType,
        a.grade,
        a.score,
        a.isTurnedIn ? 1 : 0,
        now,
      ]);

      if (isNew) {
        const dueLabel = a.dueAt
          ? ` — due ${new Date(a.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : '';
        const message = `New assignment: "${a.name}" in ${a.courseName}${dueLabel}`;

        await client.query(NOTIFY, ['new_assignment', id, message, now]);
        created.push({ type: 'new_assignment', assignmentId: id, message });
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return created;
}

module.exports = { sync };
