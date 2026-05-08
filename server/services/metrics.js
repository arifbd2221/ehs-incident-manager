// metrics.js — OSHA TRIR / DART / Severity Rate per site per year.
//
// All denominators come from the `work_hours` table (the live, audited record
// every EHS buyer expects), not the legacy `sites.total_hours_worked` cache.
// Hours are summed over the calendar year by `period_start`:
//   period_start >= 'YYYY-01-01' AND period_start < '(Y+1)-01-01'
//
// TRIR / DART / Severity Rate use the OSHA 1904 200,000-hour denominator
// (= 100 full-time equivalents working a 2,000-hour year), and ONLY the
// employee `hours_worked`. Contractor hours are surfaced as separate metrics
// per ISO 45001 §5.4 expectations but never folded into TRIR — that would
// silently change the rate every time contractor mix shifts and is not
// what OSHA 1904 measures.
//
// `annualAvgEmployees` is a weighted average of `avg_employees` across
// periods, weighted by period length in days. Periods without an
// `avg_employees` value are excluded from both numerator and denominator.

import db from '../db/connection.js';

export function calculateMetrics(siteId, year) {
  const currentYear = year || new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear + 1}-01-01`;

  // Hours sums + weighted-employee inputs for the year.
  const hoursAgg = db.prepare(`
    SELECT
      COALESCE(SUM(hours_worked), 0) AS employee_hours,
      COALESCE(SUM(contractor_hours_worked), 0) AS contractor_hours,
      SUM(CASE WHEN contractor_hours_worked IS NOT NULL THEN 1 ELSE 0 END) AS contractor_periods,
      COALESCE(SUM(
        CASE
          WHEN avg_employees IS NOT NULL
          THEN avg_employees * (julianday(period_end) - julianday(period_start))
          ELSE 0
        END
      ), 0) AS weighted_emp_numer,
      COALESCE(SUM(
        CASE
          WHEN avg_employees IS NOT NULL
          THEN (julianday(period_end) - julianday(period_start))
          ELSE 0
        END
      ), 0) AS weighted_emp_denom,
      COALESCE(SUM(
        CASE
          WHEN contractor_avg_employees IS NOT NULL
          THEN contractor_avg_employees * (julianday(period_end) - julianday(period_start))
          ELSE 0
        END
      ), 0) AS weighted_contractor_numer,
      COALESCE(SUM(
        CASE
          WHEN contractor_avg_employees IS NOT NULL
          THEN (julianday(period_end) - julianday(period_start))
          ELSE 0
        END
      ), 0) AS weighted_contractor_denom,
      COUNT(*) AS period_count
    FROM work_hours
    WHERE site_id = ? AND period_start >= ? AND period_start < ?
  `).get(siteId, yearStart, yearEnd);

  const totalHours = Number(hoursAgg?.employee_hours || 0);
  const contractorHours = Number(hoursAgg?.contractor_hours || 0);
  const contractorPeriods = Number(hoursAgg?.contractor_periods || 0);
  const weightedEmp = (hoursAgg?.weighted_emp_denom > 0)
    ? Math.round(hoursAgg.weighted_emp_numer / hoursAgg.weighted_emp_denom)
    : 0;
  const weightedContractor = (hoursAgg?.weighted_contractor_denom > 0)
    ? Math.round(hoursAgg.weighted_contractor_numer / hoursAgg.weighted_contractor_denom)
    : 0;

  // Recordable cases for the year.
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
  const daysAwayCases = cases?.days_away_cases || 0;
  const dartCases = daysAwayCases + (cases?.transfer_cases || 0);
  const totalDaysAway = cases?.total_days_away || 0;

  // OSHA 1904 200,000-hour rates. When there are zero hours, the rates are
  // zero (no denominator means no exposure to count cases against).
  const rate = (numerator, hours) => {
    if (!hours || hours <= 0) return 0;
    return parseFloat(((numerator * 200000) / hours).toFixed(2));
  };

  return {
    trir: rate(totalRecordable, totalHours),
    dart: rate(dartCases, totalHours),
    ltir: rate(daysAwayCases, totalHours),
    severityRate: rate(totalDaysAway, totalHours),
    totalRecordableCases: totalRecordable,
    dartCases,
    daysAwayCases,
    totalDaysAway,
    totalDaysRestricted: cases?.total_days_restricted || 0,
    totalHoursWorked: totalHours,
    annualAvgEmployees: weightedEmp,
    contractorHoursWorked: contractorHours,
    contractorAvgEmployees: weightedContractor,
    contractorPeriods,
    workHoursPeriods: hoursAgg?.period_count || 0,
  };
}
