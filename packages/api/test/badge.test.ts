import { describe, it, expect } from 'vitest';
import { generateBadgeSvg } from '../src/badge/generator';

describe('SVG Status Badge Generator', () => {
  it('renders verified status badge with valid SVG syntax', () => {
    const svg = generateBadgeSvg({ status: 'verified' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('truth');
    expect(svg).toContain('verified');
    expect(svg).toContain('#22c55e'); // Green
  });

  it('renders drifted status badge with yellow background', () => {
    const svg = generateBadgeSvg({ status: 'drifted' });
    expect(svg).toContain('drift detected');
    expect(svg).toContain('#eab308'); // Yellow
  });

  it('renders percentage pass rate when supplied', () => {
    const svg = generateBadgeSvg({ status: 'verified', passRate: 0.98 });
    expect(svg).toContain('98% verified');
  });

  it('supports custom labels and colors', () => {
    const svg = generateBadgeSvg({
      label: 'docs truth',
      status: 'passing',
      color: '#3b82f6',
    });
    expect(svg).toContain('docs truth');
    expect(svg).toContain('#3b82f6');
  });
});
