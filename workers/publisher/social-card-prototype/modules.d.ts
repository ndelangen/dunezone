declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
declare module '*.woff' {
  const bytes: ArrayBuffer;
  export default bytes;
}
