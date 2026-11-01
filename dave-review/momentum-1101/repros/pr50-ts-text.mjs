// Dave repro PR 50: wat geeft started_at::text / ts::text terug uit echte Postgres (pglite), en kan de browser het parsen?
import { PGlite } from '/workspace/dave/pr33/repo/node_modules/@electric-sql/pglite/dist/index.js';
const pg = new PGlite();
await pg.exec(`CREATE TABLE routine_runs (routine TEXT, trading_date DATE, started_at TIMESTAMPTZ, status TEXT, skip_reason TEXT);
INSERT INTO routine_runs VALUES ('momentum3-execute','2026-11-02', NOW(),'ok',null),('momentum3-decide','2026-11-01','2026-11-01T21:30:00.5Z','ok',null);`);
for (const tz of ['UTC', 'Europe/Amsterdam', 'America/New_York']) {
  await pg.exec(`SET TimeZone='${tz}'`);
  const { rows } = await pg.query(`SELECT routine, started_at::text AS started_at, started_at AS raw FROM routine_runs ORDER BY started_at DESC`);
  for (const r of rows) console.log(tz, JSON.stringify(r.started_at), 'Date.parse(V8)=', new Date(r.started_at).toISOString?.call ? (isNaN(Date.parse(r.started_at)) ? 'Invalid' : new Date(r.started_at).toISOString()) : '', 'raw isDate=', r.raw instanceof Date);
}
const { rows: tzr } = await pg.query(`SHOW TimeZone`); console.log('pglite default reset ->', JSON.stringify(tzr));
// ISO-8601 strict (zoals Safari/JSC) eist 'T' en '+00:00'; test de regex die de spec voorschrijft
const s = '2026-11-01 21:30:00.5+00';
console.log('ISO-8601 strict match:', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s));
