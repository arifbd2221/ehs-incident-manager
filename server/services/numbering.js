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

export function nextAssetNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(asset_number, -5) AS INTEGER)) as maxn FROM assets WHERE asset_number LIKE ?"
  ).get(`AST-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `AST-${year}-${String(next).padStart(5, '0')}`;
}

export function nextDocumentNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(document_number, -5) AS INTEGER)) as maxn FROM documents WHERE document_number LIKE ?"
  ).get(`DOC-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `DOC-${year}-${String(next).padStart(5, '0')}`;
}

export function nextRiskNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(risk_number, -5) AS INTEGER)) as maxn FROM risks WHERE risk_number LIKE ?"
  ).get(`RSK-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `RSK-${year}-${String(next).padStart(5, '0')}`;
}
