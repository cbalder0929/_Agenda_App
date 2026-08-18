const { google } = require('googleapis');
const db = require('../db');
const googleAuth = require('./googleAuth');

const DOMAIN = 'canvas.colum.edu';
const CALENDAR_NAME = 'Agendi — School Work';
const LEAD_MINUTES = 15;

async function getOrCreateCalendarId(calendar) {
  const { rows } = await db.query('SELECT calendar_id FROM google_calendar WHERE id = 1');
  if (rows[0]) return rows[0].calendar_id;

  const res = await calendar.calendars.insert({
    requestBody: { summary: CALENDAR_NAME, timeZone: 'America/Chicago' },
  });

  await db.query(
    `INSERT INTO google_calendar (id, calendar_id) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET calendar_id = EXCLUDED.calendar_id`,
    [res.data.id]
  );

  return res.data.id;
}

function buildEventBody(a) {
  const start = new Date(new Date(a.due_at).getTime() - LEAD_MINUTES * 60000).toISOString();
  const url = `https://${DOMAIN}/courses/${a.course_id}/assignments/${a.id}`;
  return {
    summary: `📚 ${a.name}`,
    description: `${a.course_name}\n${url}`,
    start: { dateTime: start },
    end: { dateTime: a.due_at },
  };
}

async function syncDueDates() {
  const client = await googleAuth.getAuthorizedClient();
  if (!client) throw new Error('Google Calendar is not connected');

  const calendar = google.calendar({ version: 'v3', auth: client });
  const calendarId = await getOrCreateCalendarId(calendar);

  const { rows: assignments } = await db.query(
    `SELECT id, name, course_id, course_name, due_at, google_event_id
     FROM assignments
     WHERE due_at IS NOT NULL AND due_at::timestamptz > NOW()
     ORDER BY due_at`
  );

  let created = 0;
  let updated = 0;

  for (const a of assignments) {
    const requestBody = buildEventBody(a);

    if (a.google_event_id) {
      try {
        await calendar.events.patch({ calendarId, eventId: a.google_event_id, requestBody });
        updated++;
        continue;
      } catch (err) {
        if (err.code !== 404 && err.code !== 410) throw err;
        // event was deleted on the Google side — fall through and recreate it
      }
    }

    const res = await calendar.events.insert({ calendarId, requestBody });
    await db.query('UPDATE assignments SET google_event_id = $1 WHERE id = $2', [res.data.id, a.id]);
    created++;
  }

  return { created, updated, total: assignments.length };
}

module.exports = { syncDueDates };
