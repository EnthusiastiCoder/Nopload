// U1.6 thirdParty filters out same-origin, blob: and data: entries.
import { describe, expect, it } from 'vitest';
import { thirdParty, type RequestEntry } from '../../src/lib/network-audit';

const SELF = 'http://localhost:4321';

const e = (url: string, initiatorType = 'script'): RequestEntry => {
  let origin = 'null';
  try {
    origin = new URL(url).origin;
  } catch {
    /* keep "null" */
  }
  return { origin, url, initiatorType };
};

describe('thirdParty', () => {
  it('returns only the entries from other origins', () => {
    const entries = [
      e(`${SELF}/`),
      e(`${SELF}/_astro/app.js`),
      e(`${SELF}/models/modnet/model_quantized.onnx`, 'fetch'),
      e('https://fonts.googleapis.com/css2?family=Inter', 'link'),
      e('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.wasm', 'fetch'),
      e('http://localhost:5000/x.js'),
    ];
    const out = thirdParty(entries, SELF);
    expect(out.map((x) => x.url)).toEqual([
      'https://fonts.googleapis.com/css2?family=Inter',
      'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.wasm',
      'http://localhost:5000/x.js',
    ]);
  });

  it('ignores blob: and data: URLs', () => {
    const entries = [
      e('blob:http://localhost:4321/1b4e28ba-2fa1-11d2-883f-0016d3cca427', 'img'),
      e('data:image/png;base64,iVBORw0KGgo=', 'img'),
    ];
    expect(thirdParty(entries, SELF)).toEqual([]);
  });

  it('returns an empty list when everything is same-origin', () => {
    expect(thirdParty([e(`${SELF}/a`), e(`${SELF}/b`)], SELF)).toEqual([]);
  });
});
