import picocolors from 'picocolors';

export interface BadgeCommandOptions {
  org?: string;
  repo?: string;
  host?: string;
  label?: string;
  format?: 'markdown' | 'html' | 'url';
}

/**
 * Generate Markdown or HTML status badge snippet for README.md
 */
export function runChronaBadge(options: BadgeCommandOptions = {}): string {
  const org = options.org || 'owner';
  const repo = options.repo || 'repo';
  const host = options.host || 'https://api.chronadocs.xyz';
  const label = options.label;

  const urlParams = label ? `?label=${encodeURIComponent(label)}` : '';
  const badgeUrl = `${host}/badges/${org}/${repo}/status.svg${urlParams}`;
  const targetLink = `https://chronadocs.xyz/${org}/${repo}`;

  let output = '';

  switch (options.format) {
    case 'html':
      output = `<a href="${targetLink}"><img src="${badgeUrl}" alt="Chrona Verified" /></a>`;
      break;
    case 'url':
      output = badgeUrl;
      break;
    case 'markdown':
    default:
      output = `[![Chrona Verified](${badgeUrl})](${targetLink})`;
      break;
  }

  console.log(picocolors.cyan('\nChrona Truth Verification Badge:\n'));
  console.log(picocolors.bold(output));
  console.log(picocolors.dim('\nAdd this snippet to your project README.md to display live verified status.\n'));

  return output;
}
