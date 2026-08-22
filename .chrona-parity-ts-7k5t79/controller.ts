import { authenticateUser, Session } from './auth';

export function handlePayment(token: string, amount: number): { success: boolean } {
  const session = authenticateUser(token);
  if (!session.isAdmin) {
    throw new Error('Admin role required');
  }
  return { success: true };
}