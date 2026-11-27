import { useEffect, useState } from 'react';
import { resendDeadline, resendSecondsLeft } from '@/domain/email-verification';

const addressKey = (address: string) => address.trim().toLowerCase();

/**
 * The 60-second "send again" wait. It counts from an absolute deadline, so time spent in the background counts, and it
 * belongs to one address: typing another address shows no wait. `startNow` starts it on mount, for a code just sent.
 */
export function useResendWait(address: string, startNow = false) {
  const [wait, setWait] = useState(() => startNow ? { address: addressKey(address), until: resendDeadline() } : null);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = resendSecondsLeft(wait?.address === addressKey(address) ? wait.until : null, now);
  const waiting = secondsLeft > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [waiting]);
  return {
    secondsLeft,
    waiting,
    /** Whether a code was sent in this flow, to any address. */
    sent: wait !== null,
    /** Call after a successful send to the current address. */
    start: () => { setWait({ address: addressKey(address), until: resendDeadline() }); setNow(Date.now()); },
  };
}
