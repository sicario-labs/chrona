export function login(user: string, role: string): boolean {
  if (!user || role !== 'admin') throw new Error('Admin role required');
  return true;
}