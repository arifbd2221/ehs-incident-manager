// server/scripts/backfill-user-profile-fields.js
//
// One-off backfill: populate address / phone / dob / gender / hire_date
// for demo accounts so the wizard's "pick from employee list" affordance
// auto-fills the regulatory fields end-to-end. Safe to re-run — UPDATEs
// only touch rows where the targeted column is still NULL.
//
// Each demo persona has a deterministic profile (no PII generation, just
// matched-to-role plausibles) keyed by email. New users / users not in
// the map are left alone — backfill is intentionally non-destructive so
// real user-entered values are never overwritten.
//
// Run from server/:
//   node scripts/backfill-user-profile-fields.js

import db from '../db/connection.js';

// Each entry: email → { address, phone, dob, gender, hire_date }
// Addresses use the site's country to keep the regulator-form output
// plausible (US addresses for OSHA orgs, UK for RIDDOR, AU for NSW).
const PROFILES = {
  // SDS Manager Inc. (org 1) — Cleveland, Sheffield, Dallas, Sydney
  'sarah@sdsmanager.com':    { address: '1421 W 9th St, Cleveland, OH 44113',         phone: '+1 216-555-0142', dob: '1981-06-14', gender: 'female', hire_date: '2014-03-10' },
  'elena@sdsmanager.com':    { address: '2210 Lakeside Ave, Cleveland, OH 44114',     phone: '+1 216-555-0188', dob: '1985-11-02', gender: 'female', hire_date: '2017-07-21' },
  'marcus@sdsmanager.com':   { address: '845 Prospect Ave E, Cleveland, OH 44115',    phone: '+1 216-555-0211', dob: '1979-02-19', gender: 'male',   hire_date: '2012-09-05' },
  'priya@sdsmanager.com':    { address: '1100 Superior Ave, Cleveland, OH 44114',     phone: '+1 216-555-0265', dob: '1988-05-30', gender: 'female', hire_date: '2019-01-14' },
  'wendy@sdsmanager.com':    { address: '301 Euclid Ave, Cleveland, OH 44115',        phone: '+1 216-555-0303', dob: '1992-08-12', gender: 'female', hire_date: '2021-04-12' },
  'james@sdsmanager.com':    { address: '14 Pinstone St, Sheffield S1 2HN, UK',       phone: '+44 114 555 0184', dob: '1976-12-09', gender: 'male',   hire_date: '2010-06-01' },
  'mehta@sdsmanager.com':    { address: '550 S Lamar St, Dallas, TX 75202',           phone: '+1 214-555-0166', dob: '1984-04-22', gender: 'male',   hire_date: '2018-11-19' },
  'tom@sdsmanager.com':      { address: '12 George St, Sydney NSW 2000, Australia',   phone: '+61 2 5550 1842', dob: '1983-09-28', gender: 'male',   hire_date: '2016-02-08' },
  'kate@sdsmanager.com':     { address: '88 Phillip St, Sydney NSW 2000, Australia',  phone: '+61 2 5550 2103', dob: '1990-07-05', gender: 'female', hire_date: '2020-08-17' },
  'ben@sdsmanager.com':      { address: '45 Market St, Sydney NSW 2000, Australia',   phone: '+61 2 5550 2247', dob: '1995-03-11', gender: 'male',   hire_date: '2022-05-03' },
  // Additional Cleveland line workers (Tom Lee + the rest of the 17-person org)
  'tom.lee@example.com':     { address: '4520 Pearl Rd, Cleveland, OH 44109',         phone: '+1 216-555-0421', dob: '1987-10-18', gender: 'male',   hire_date: '2015-11-30' },
  // Demo / test accounts in other orgs
  'acme@sdsmanager.com':     { address: '500 N Michigan Ave, Chicago, IL 60611',      phone: '+1 312-555-0190', dob: '1972-01-25', gender: 'female', hire_date: '2008-05-12' },
  'sydney-test@example.com': { address: '1 Bligh St, Sydney NSW 2000, Australia',     phone: '+61 2 5550 9001', dob: '1980-04-04', gender: 'male',   hire_date: '2013-10-22' },
};

const upd = db.prepare(`
  UPDATE users SET
    address    = COALESCE(address, ?),
    phone      = COALESCE(phone, ?),
    dob        = COALESCE(dob, ?),
    gender     = COALESCE(gender, ?),
    hire_date  = COALESCE(hire_date, ?)
  WHERE email = ?
`);

let updated = 0, missing = 0;
const apply = db.transaction(() => {
  for (const [email, p] of Object.entries(PROFILES)) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!exists) { missing++; continue; }
    upd.run(p.address, p.phone, p.dob, p.gender, p.hire_date, email);
    updated++;
  }
});
apply();

console.log(`Backfilled profile fields for ${updated} users (${missing} demo entries had no matching user).`);

// Summary of any user still missing all four new fields — surfaces gaps
// where a new demo account was added but never given a profile here.
const stillEmpty = db.prepare(`
  SELECT id, email, name FROM users
  WHERE address IS NULL AND phone IS NULL AND dob IS NULL AND gender IS NULL
  ORDER BY org_id, id
`).all();
if (stillEmpty.length > 0) {
  console.log(`\n${stillEmpty.length} users have no profile fields set:`);
  for (const u of stillEmpty) console.log(`  [${u.id}] ${u.email} — ${u.name}`);
}
