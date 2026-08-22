export function verifyAuth(token: string): boolean {
  if (!token) throw new Error('Token required');
  return true;
}