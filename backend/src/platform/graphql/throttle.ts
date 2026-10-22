/** Stricter limit for login / register / reset / upload endpoints. Read lazily so .env is already loaded. */
const num = (name: string, fallback: number) => () => Number(process.env[name] ?? fallback);

export const AUTH_THROTTLE = {
  default: { limit: num('THROTTLE_AUTH_LIMIT', 10), ttl: () => Number(process.env.THROTTLE_TTL_SEC ?? 60) * 1000 },
};
export const UPLOAD_THROTTLE = {
  default: { limit: num('THROTTLE_UPLOAD_LIMIT', 20), ttl: () => Number(process.env.THROTTLE_TTL_SEC ?? 60) * 1000 },
};
