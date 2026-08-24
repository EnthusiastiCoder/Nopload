declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      cb: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
    ): void;
  }
  const libheif: { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } };
  export default libheif;
}
