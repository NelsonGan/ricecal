export interface ScanGeometry { x: number; y: number; width: number; height: number; beamX: number; beamWidth: number; beamHeight: number }
export declare const SEARCH_VIDEO: { width: number; height: number; fps: number; duration: number };
export declare function renderSearchVideo(args: { locale: string; data: string; geometry: ScanGeometry }): Promise<Buffer>;
export declare function validateScanGeometry(geometry: ScanGeometry): ScanGeometry;
