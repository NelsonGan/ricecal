// A Simlock lease names its simulator `simlock-<uuid>`, and that name is what
// the capture script records. It says nothing about the model, so the image
// dimensions checked beside it are what pin the iPhone and the iPhone Duo.
const LEASE = /^simlock-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Whether a capture record's device can have taken a set: one of the set's
 * retired fixed simulators, which took the captures in the repo now, or any
 * pool lease, which is where every recapture comes from.
 */
export function capturedOnAllowedDevice(retired, device) {
  return typeof device === 'string' && (retired.includes(device) || LEASE.test(device));
}
