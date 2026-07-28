/// <reference types="nativewind/types" />

// `import './global.css'` is consumed by the NativeWind Metro transformer, not
// by TypeScript. Without this declaration tsc rejects the side-effect import.
declare module '*.css' {}
