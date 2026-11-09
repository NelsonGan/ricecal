export declare function shouldCommitAndroidEdit(cancelled: boolean, failures: number, successes: number): boolean;
export declare function requireSuccessfulUpload<T extends { errors?: string[]; skipped?: boolean; uploaded?: string[] }>(result: T): T;
