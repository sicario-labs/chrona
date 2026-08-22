export interface BadgeOptions {
  label?: string;
  status: 'verified' | 'drifted' | 'failing' | 'passing' | 'unknown';
  passRate?: number;
  color?: string;
  style?: 'flat' | 'plastic';
}

const COLOR_MAP: Record<string, string> = {
  verified: '#22c55e', // Green
  passing: '#22c55e',
  drifted: '#eab308', // Yellow
  failing: '#ef4444', // Red
  unknown: '#6b7280', // Gray
};

/**
 * Pure SVG Badge Generator (Shields.io compliant format)
 */
export function generateBadgeSvg(options: BadgeOptions): string {
  const label = options.label || 'truth';
  let message = options.status;

  if (typeof options.passRate === 'number') {
    message = `${Math.round(options.passRate * 100)}% verified` as typeof message;
  } else if (options.status === 'verified') {
    message = 'verified' as typeof message;
  } else if (options.status === 'drifted') {
    message = 'drift detected' as typeof message;
  } else if (options.status === 'failing') {
    message = 'failing' as typeof message;
  }

  const bgRight = options.color || COLOR_MAP[options.status] || '#6b7280';
  const bgLeft = '#1f2937'; // Dark gray

  // Character width heuristic for SVG rendering
  const labelWidth = Math.round(label.length * 7 + 12);
  const messageWidth = Math.round(message.length * 7 + 14);
  const totalWidth = labelWidth + messageWidth;

  const labelCenter = labelWidth / 2;
  const messageCenter = labelWidth + messageWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${message}">
  <title>${label}: ${message}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="${bgLeft}"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${bgRight}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelCenter * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${label}</text>
    <text x="${labelCenter * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelWidth - 10) * 10}">${label}</text>
    <text aria-hidden="true" x="${messageCenter * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(messageWidth - 10) * 10}">${message}</text>
    <text x="${messageCenter * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(messageWidth - 10) * 10}">${message}</text>
  </g>
</svg>`;
}
