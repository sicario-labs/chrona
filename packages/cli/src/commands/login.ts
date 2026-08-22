import picocolors from 'picocolors';
import { initiateDeviceAuth, pollDeviceToken, saveCredentials, getStoredCredentials } from '../utils/device-auth';
import { ansiLink, LiveStatus } from '../utils/terminal-ui';

export async function runChronaLogin() {
  console.log(picocolors.bold(picocolors.cyan('\n⚡ CHRONA Terminal Authentication (RFC 8628)\n')));

  const existing = await getStoredCredentials();
  if (existing && existing.expiresAt > Date.now()) {
    console.log(picocolors.green(`  ✓ Already authenticated as ${picocolors.bold(existing.user.email)}`));
    console.log(picocolors.dim(`  Token valid until: ${new Date(existing.expiresAt).toLocaleString()}\n`));
    return;
  }

  const live = new LiveStatus();
  live.update(picocolors.dim('  Requesting device verification code...'));

  const session = await initiateDeviceAuth();
  live.clear();

  console.log(picocolors.bold('  To complete authentication:'));
  console.log(`  1. Copy your one-time code: ${picocolors.bold(picocolors.yellow(session.userCode))}`);
  console.log(
    `  2. Open the verification URL: ${ansiLink(session.verificationUriComplete, picocolors.bold(picocolors.underline(picocolors.cyan(session.verificationUriComplete))))}\n`
  );

  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinIdx = 0;

  try {
    const creds = await pollDeviceToken(session, (elapsed) => {
      const char = spinnerChars[spinIdx++ % spinnerChars.length];
      live.update(
        picocolors.cyan(`  ${char} `) +
          picocolors.white('Waiting for browser approval... ') +
          picocolors.dim(`(${elapsed}s elapsed)`)
      );
    });

    await saveCredentials(creds);
    live.done(
      picocolors.green(`\n  ✓ Successfully authenticated as `) +
        picocolors.bold(creds.user.email) +
        picocolors.dim(` (${creds.user.name || 'Developer'})\n`)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    live.done(picocolors.red(`\n  ✖ Login failed: ${message}\n`));
    process.exitCode = 1;
  }
}
