import { useEffect, useState } from 'react';
import { pollStatus, timeLeftText, tickMs, STATUS_LABEL } from '../../utils/pollTime';

// show="chip" -> the status label (Soon / Ongoing / Ending / Ended)
// show="left" -> the countdown (3 days left / 5 hours left / 42 mins left / 9 mins 30 secs left)
// It keeps itself up to date; pass `now` if the parent already ticks every second.
export default function PollStatus({ poll, show = 'chip', now: nowProp, inline = false }) {
  const [own, setOwn] = useState(() => new Date());
  const now = nowProp || own;
  const interval = nowProp ? 0 : tickMs(poll, now);

  useEffect(() => {
    if (!interval) return undefined;
    const t = setInterval(() => setOwn(new Date()), interval);
    return () => clearInterval(t);
  }, [interval]);

  const status = pollStatus(poll, now);
  if (show === 'left') {
    if (status === 'ended') return null; // the chip already says "Ended"
    return <span className={`time-left ${status}`}>{timeLeftText(poll, now)}</span>;
  }
  return (
    <span className={`status-chip ${status}${inline ? ' inline' : ''}`}>
      <i />{STATUS_LABEL[status]}
    </span>
  );
}
