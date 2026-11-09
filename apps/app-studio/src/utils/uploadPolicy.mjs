// A partly failed edit must never replace live store listings.
export const shouldCommitAndroidEdit = (cancelled, failures, successes) =>
  !cancelled && failures === 0 && successes > 0;

// The server can report per-listing failures in an otherwise successful response.
export function requireSuccessfulUpload(result) {
  if (result.errors?.length) throw new Error(result.errors.join('; '));
  if (!result.skipped && !result.uploaded?.length) throw new Error('No images were uploaded.');
  return result;
}
