import db from '../db/connection.js';

export function calculateMetrics(siteId, year) {
  const currentYear = year || new Date().getFullYear();

  const site = db.prepare('SELECT total_hours_worked, annual_avg_employees FROM sites WHERE id = ?').get(siteId);
  const totalHours = site?.total_hours_worked || 1;

  const cases = db.prepare(`
    SELECT
      COUNT(*) as total_recordable,
      SUM(classification_death) as deaths,
      SUM(classification_days_away) as days_away_cases,
      SUM(classification_job_transfer) as transfer_cases,
      SUM(classification_other) as other_cases,
      SUM(days_away_count) as total_days_away,
      SUM(days_restricted_count) as total_days_restricted
    FROM osha_300_log
    WHERE site_id = ? AND calendar_year = ?
  `).get(siteId, currentYear);

  const totalRecordable = cases?.total_recordable || 0;
  const dartCases = (cases?.days_away_cases || 0) + (cases?.transfer_cases || 0);

  const trir = totalHours > 0 ? ((totalRecordable * 200000) / totalHours).toFixed(2) : '0.00';
  const dart = totalHours > 0 ? ((dartCases * 200000) / totalHours).toFixed(2) : '0.00';
  const severityRate = totalHours > 0 ? (((cases?.total_days_away || 0) * 200000) / totalHours).toFixed(2) : '0.00';

  return {
    trir: parseFloat(trir),
    dart: parseFloat(dart),
    severityRate: parseFloat(severityRate),
    totalRecordableCases: totalRecordable,
    dartCases,
    totalDaysAway: cases?.total_days_away || 0,
    totalDaysRestricted: cases?.total_days_restricted || 0,
    totalHoursWorked: totalHours,
    annualAvgEmployees: site?.annual_avg_employees || 0,
  };
}
