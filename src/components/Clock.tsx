import { useEffect, useState } from 'react';

type ClockProps = {
  time: number | null;
  active: boolean;
  receivedAt: number;
};

export function Clock({ time, active, receivedAt }: ClockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || time === null) {
      setNow(Date.now());
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [active, time]);

  if (time === null) {
    return <span className="clock">No time limit</span>;
  }

  const visibleTime = active ? Math.max(0, time - Math.max(0, now - receivedAt)) : time;

  return <span className={active ? 'clock active-clock' : 'clock'}>{formatTime(visibleTime)}</span>;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
