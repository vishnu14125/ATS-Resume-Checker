/**
 * Resume date parsing. Produces PartialDate / DateRange values matching the
 * canonical contracts. Duration is precision-aware (year-only ranges widen the
 * min/max around a best estimate). All comparisons use an injected reference
 * date so the engine stays deterministic.
 */

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const SEASONS = { spring: [3, 5], summer: [6, 8], fall: [9, 11], autumn: [9, 11], winter: [12, 2] };
const RANGE_SEP = /\s*(?:-|–|—|−|to|until|till|through|thru)\s*/i;
const PRESENT = /\b(present|current|now|ongoing|date)\b/i;

function twoDigitYear(yy) {
  const n = Number(yy);
  return n <= 49 ? 2000 + n : 1900 + n;
}

/** Parses a single date token into a PartialDate, or null. */
function parseSingleDate(input) {
  if (!input) return null;
  const str = input.trim();

  const monthYear = /^([A-Za-z]{3,9})\.?\s*[',]?\s*(\d{2}|\d{4})$/.exec(str);
  if (monthYear && MONTHS[monthYear[1].toLowerCase()]) {
    const year = monthYear[2].length === 2 ? twoDigitYear(monthYear[2]) : Number(monthYear[2]);
    return { year, month: MONTHS[monthYear[1].toLowerCase()], precision: 'month' };
  }

  const numeric = /^(\d{1,2})[/.-](\d{4})$/.exec(str) || /^(\d{4})[/.-](\d{1,2})$/.exec(str);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const [month, year] = a > 12 ? [b, a] : [a, b];
    if (month >= 1 && month <= 12 && year >= 1900) return { year, month, precision: 'month' };
  }

  const season = /^(spring|summer|fall|autumn|winter)\s+(\d{4})$/i.exec(str);
  if (season) return { year: Number(season[2]), month: SEASONS[season[1].toLowerCase()][0], precision: 'season' };

  const yearOnly = /^(\d{4})$/.exec(str);
  if (yearOnly && Number(yearOnly[1]) >= 1900 && Number(yearOnly[1]) <= 2100) {
    return { year: Number(yearOnly[1]), month: null, precision: 'year' };
  }
  return null;
}

function toAbsMonths(date, endOfRange) {
  const month = date.month || (endOfRange ? 12 : 1);
  return date.year * 12 + month;
}

/** Precision-aware month span between two PartialDates (inclusive of both endpoints). */
function computeDuration(start, end) {
  const startMin = toAbsMonths(start, false);
  const startMax = start.precision === 'year' ? start.year * 12 + 12 : startMin;
  const endMin = end.precision === 'year' ? end.year * 12 + 1 : toAbsMonths(end, true);
  const endMax = toAbsMonths(end, true);
  const minMonths = Math.max(0, endMin - startMax + 1);
  const maxMonths = Math.max(0, endMax - startMin + 1);
  const bestMonths = Math.round((minMonths + maxMonths) / 2);
  return { minMonths, bestMonths, maxMonths };
}

/**
 * Parses a date range such as "Jan 2020 - Present" or "2019 – 2021".
 * @param {string} text
 * @param {Date} referenceDate  used to resolve "Present"
 * @returns {object|null} a DateRange, or null if no range/date is found
 */
function parseDateRange(text, referenceDate = new Date()) {
  if (!text) return null;
  const sourceText = text.trim();
  const parts = sourceText.split(RANGE_SEP);

  let start = null;
  let end = null;
  let isCurrent = false;

  if (parts.length >= 2) {
    start = parseSingleDate(parts[0]);
    const endRaw = parts.slice(1).join(' ').trim();
    if (PRESENT.test(endRaw)) isCurrent = true;
    else end = parseSingleDate(endRaw);
  } else {
    start = parseSingleDate(parts[0]);
  }
  if (!start) return null;

  if (isCurrent) {
    end = { year: referenceDate.getFullYear(), month: referenceDate.getMonth() + 1, precision: 'month' };
  }

  let duration = null;
  if (end) {
    if (toAbsMonths(end, true) < toAbsMonths(start, false)) {
      return { start, end: isCurrent ? null : end, isCurrent, sourceText, duration: null }; // end before start: keep dates, no duration
    }
    duration = computeDuration(start, end);
  }

  return { start, end: isCurrent ? null : end, isCurrent, sourceText, duration };
}

/** Finds and parses the first date range appearing anywhere in a line. */
function findDateRange(text, referenceDate = new Date()) {
  const rangePattern = /((?:[A-Za-z]{3,9}\.?\s*[',]?\s*)?(?:\d{1,2}[/.-])?\d{4})\s*(?:-|–|—|−|to|until|till|through)\s*((?:present|current|now|ongoing)|(?:[A-Za-z]{3,9}\.?\s*[',]?\s*)?(?:\d{1,2}[/.-])?\d{4})/i;
  const match = rangePattern.exec(text);
  if (match) return parseDateRange(match[0], referenceDate);
  const single = /(?:[A-Za-z]{3,9}\.?\s+)?\b(19|20)\d{2}\b/.exec(text);
  if (single) return parseDateRange(single[0], referenceDate);
  return null;
}

module.exports = { parseSingleDate, parseDateRange, findDateRange, computeDuration, MONTHS };
