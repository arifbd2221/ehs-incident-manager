import db from '../db/connection.js';

export function nextIncidentNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(incident_number, -4) AS INTEGER)) as maxn FROM incidents WHERE incident_number LIKE ?"
  ).get(`INC-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `INC-${year}-${String(next).padStart(4, '0')}`;
}

export function nextInvestigationNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(investigation_number, -4) AS INTEGER)) as maxn FROM investigations WHERE investigation_number LIKE ?"
  ).get(`INV-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `INV-${year}-${String(next).padStart(4, '0')}`;
}

export function nextCapaNumber() {
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(capa_number, 6) AS INTEGER)) as maxn FROM capas"
  ).get();
  const next = (row?.maxn || 0) + 1;
  return `CAPA-${String(next).padStart(3, '0')}`;
}

export function nextRiddorNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(riddor_number, -3) AS INTEGER)) as maxn FROM riddor_reports WHERE riddor_number LIKE ?"
  ).get(`RDR-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `RDR-${year}-${String(next).padStart(3, '0')}`;
}
