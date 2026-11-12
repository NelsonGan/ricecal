// A Simlock lease's simulator name, `simlock-<uuid>`. README: "The App Studio".
const LEASE = /^simlock-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Whether a capture record's device can have taken a set: one of the set's
 * retired fixed simulators, which took the captures in the repo now, or any
 * pool lease, which is where every recapture comes from.
 */
export function capturedOnAllowedDevice(retired, device) {
  return typeof device === 'string' && (retired.includes(device) || LEASE.test(device));
}
