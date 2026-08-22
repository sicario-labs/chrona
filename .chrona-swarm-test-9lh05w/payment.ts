import { verifyAuth } from './auth';

export function processPayment(amount: number, token: string): boolean {
  verifyAuth(token);
  if (amount <= 0) throw new Error('Amount must be positive');
  return true;
}