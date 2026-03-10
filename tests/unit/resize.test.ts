// U3.1 targetSize maths.
import { describe, expect, it } from 'vitest';
import { targetSize } from '../../src/tools/batch/resize';

const BIG = { w: 4000, h: 3000 };

describe('targetSize (U3.1)', () => {
  it('percent 50 of 4000x3000 = 2000x1500', () => {
    expect(targetSize(BIG, { kind: 'percent', p: 50 })).toMatchObject({ w: 2000, h: 1500 });
  });

  it('width 800 keepAspect = 800x600', () => {
    expect(targetSize(BIG, { kind: 'width', w: 800, keepAspect: true })).toMatchObject({ w: 800, h: 600 });
  });

  it('width 800 without keepAspect keeps the source height', () => {
    expect(targetSize(BIG, { kind: 'width', w: 800, keepAspect: false })).toMatchObject({ w: 800, h: 3000 });
  });

  it('height 300 = 400x300', () => {
    expect(targetSize(BIG, { kind: 'height', h: 300 })).toMatchObject({ w: 400, h: 300 });
  });

  it('fit 800x800 (contain) = 800x600 with no crop', () => {
    const r = targetSize(BIG, { kind: 'fit', w: 800, h: 800 });
    expect(r).toMatchObject({ w: 800, h: 600 });
    expect(r.crop).toBeUndefined();
  });

  it('cover 800x800 = exactly 800x800 with a centred crop', () => {
    const r = targetSize(BIG, { kind: 'cover', w: 800, h: 800 });
    expect(r).toMatchObject({ w: 800, h: 800 });
    expect(r.crop).toEqual({ x: 500, y: 0, w: 3000, h: 3000 });
  });

  it('aspect 1:1 of 4000x3000 crops 3000x3000 at x=500', () => {
    const r = targetSize(BIG, { kind: 'aspect', ratio: '1:1' });
    expect(r.crop).toEqual({ x: 500, y: 0, w: 3000, h: 3000 });
    expect(r).toMatchObject({ w: 3000, h: 3000 });
  });

  it('aspect 16:9 of 4000x3000 crops 4000x2250 at y=375', () => {
    const r = targetSize(BIG, { kind: 'aspect', ratio: '16:9' });
    expect(r.crop).toEqual({ x: 0, y: 375, w: 4000, h: 2250 });
    expect(r).toMatchObject({ w: 4000, h: 2250 });
  });

  it('aspect 4:5 of 4000x3000 crops 2400x3000 at x=800', () => {
    const r = targetSize(BIG, { kind: 'aspect', ratio: '4:5' });
    expect(r.crop).toEqual({ x: 800, y: 0, w: 2400, h: 3000 });
  });

  it('noUpscale (the default) keeps 500x400 for width 800', () => {
    expect(targetSize({ w: 500, h: 400 }, { kind: 'width', w: 800, keepAspect: true })).toMatchObject({ w: 500, h: 400 });
    expect(targetSize({ w: 500, h: 400 }, { kind: 'fit', w: 800, h: 800 })).toMatchObject({ w: 500, h: 400 });
    expect(targetSize({ w: 500, h: 400 }, { kind: 'percent', p: 200 })).toMatchObject({ w: 500, h: 400 });
  });

  it('noUpscale false allows upscaling', () => {
    expect(targetSize({ w: 500, h: 400 }, { kind: 'width', w: 800, keepAspect: true }, { noUpscale: false })).toMatchObject({
      w: 800,
      h: 640,
    });
  });

  it('never returns 0 and always returns integers', () => {
    const cases = [
      targetSize({ w: 10, h: 10 }, { kind: 'percent', p: 1 }),
      targetSize({ w: 1000, h: 1 }, { kind: 'width', w: 1, keepAspect: true }),
      targetSize({ w: 1, h: 1000 }, { kind: 'fit', w: 10, h: 10 }),
      targetSize({ w: 333, h: 777 }, { kind: 'percent', p: 33 }),
    ];
    for (const r of cases) {
      expect(r.w).toBeGreaterThanOrEqual(1);
      expect(r.h).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(r.w)).toBe(true);
      expect(Number.isInteger(r.h)).toBe(true);
    }
  });
});
