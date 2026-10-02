declare module '*.css' {
  const text: string;
  export default text;
}

declare module '*.woff2' {
  const bytes: ArrayBuffer;
  export default bytes;
}

declare module '*.woff' {
  const bytes: ArrayBuffer;
  export default bytes;
}

declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
