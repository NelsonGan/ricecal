/** Bounds read from Apple's Photoshop templates, downloaded 6 October 2026. */
export const APP_STORE_ASSETS = {
  header: {
    width: 3840, height: 1646, ratio: '21:9',
    label: 'Product Page Header',
    safe: { x: 1097, y: 493, width: 1646, height: 661 },
    template: 'https://devimages-cdn.apple.com/design/resources/download/app-store/creative_assets-product_page_header_template-static.psd',
  },
  search: {
    width: 3840, height: 2560, ratio: '3:2',
    label: 'Search Results',
    safe: { x: 836, y: 765, width: 2168, height: 1030 },
    template: 'https://devimages-cdn.apple.com/design/resources/download/app-store/creative_assets-search_results_template-static.psd',
  },
} as const;

export type AppStorePlacement = keyof typeof APP_STORE_ASSETS;

export const APP_STORE_GUIDANCE = 'https://developer.apple.com/app-store/asset-best-practices/';
export const APP_STORE_SPECS = 'https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications';
