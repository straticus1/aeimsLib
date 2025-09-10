import { ConstantPattern } from '../../patterns/ConstantPattern';

describe('ConstantPattern', () => {
  const config = {
    name: 'test',
    minIntensity: 0,
    maxIntensity: 100,
    defaultIntensity: 50
  };

  it('should create a constant pattern with default intensity', () => {
    const pattern = new ConstantPattern(config);
    expect(pattern.getIntensity(0)).toBe(50);
  });

  it('should validate intensity within range', () => {
    const pattern = new ConstantPattern(config);
    expect(pattern.validate(50)).toBe(true);
    expect(pattern.validate(-10)).toBe(false);
    expect(pattern.validate(150)).toBe(false);
  });

  it('should clamp intensity to valid range', () => {
    const pattern = new ConstantPattern(config);
    pattern.setIntensity(150);
    expect(pattern.getIntensity(0)).toBe(100);
    pattern.setIntensity(-10);
    expect(pattern.getIntensity(0)).toBe(0);
  });
});
