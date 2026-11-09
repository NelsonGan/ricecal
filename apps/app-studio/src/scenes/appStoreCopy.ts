import { SEARCH_LOCALES } from '../data/searchCreatives';

export interface AppStoreCopy {
  search: string;
  camera: string;
  scanning: string;
}

/** Copy and the country-specific meal resolve the same canonical locale catalog. */
export const APP_STORE_COPY: Record<string, AppStoreCopy> = SEARCH_LOCALES;
