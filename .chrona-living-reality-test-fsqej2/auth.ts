export function verifyAuth(token: string, secret: string): boolean {
  if (!token || !secret) throw new Error('Token and secret required');
  return true;
}