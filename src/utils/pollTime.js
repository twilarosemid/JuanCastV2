// Poll status + countdown, worked out from the poll's start / end dates.
//   soon     -> hasn't started yet
//   ongoing  -> running
//   ending   -> running, but 4 hours or less are left
//   ended    -> finished
export const ENDING_SOON_MS = 4 * 60 * 60 * 1000;
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SECONDS_BELOW_MS = 10 * MIN; // under this many minutes left the countdown also shows seconds

export const STATUS_LABEL = { soon: 'Soon', ongoing: 'Ongoing', ending: 'Ending', ended: 'Ended' };

export const pollStatus = (poll, now = new Date()) => {
  const t = +now;
  const from = poll?.fromDate ? +new Date(poll.fromDate) : 0;
  const to = poll?.toDate ? +new Date(poll.toDate) : 0;
  if (from && from > t) return 'soon';
  if (to && to <= t) return 'ended';
  if (to && to - t <= ENDING_SOON_MS) return 'ending';
  return 'ongoing';
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// 3 days / 5 hours / 42 mins / 9 mins 30 secs
export const formatRemaining = (ms) => {
  const left = Math.max(0, ms);
  if (left >= DAY) return plural(Math.floor(left / DAY), 'day');
  if (left >= HOUR) return plural(Math.floor(left / HOUR), 'hour');
  if (left >= SECONDS_BELOW_MS) return plural(Math.floor(left / MIN), 'min');
  const mins = Math.floor(left / MIN);
  const secs = Math.floor((left % MIN) / SEC);
  return mins > 0 ? `${plural(mins, 'min')} ${plural(secs, 'sec')}` : plural(secs, 'sec');
};

export const timeLeftText = (poll, now = new Date()) => {
  const status = pollStatus(poll, now);
  if (status === 'ended') return 'Ended';
  if (status === 'soon') return `Starts in ${formatRemaining(new Date(poll.fromDate) - now)}`;
  if (!poll.toDate) return '';
  return `${formatRemaining(new Date(poll.toDate) - now)} left`;
};

// how often a countdown has to refresh: every second in the last minutes, otherwise every 15 s
export const tickMs = (poll, now = new Date()) => {
  const status = pollStatus(poll, now);
  if (status === 'ended') return 0;
  const target = status === 'soon' ? new Date(poll.fromDate) : new Date(poll.toDate);
  return target - now < SECONDS_BELOW_MS ? 1000 : 15000;
};

// "Oct 29, 2026, 12:00 AM"
export const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
