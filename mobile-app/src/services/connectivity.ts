/** Whether the last request to the server got no answer. Set by every backend request; read by the offline banner and caches. */
let offline = false;
const listeners = new Set<() => void>();
export const connectivity = {
  isOffline: () => offline,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  report(reachable: boolean) {
    if (offline === !reachable) return;
    offline = !reachable;
    listeners.forEach(listener => listener());
  },
};
