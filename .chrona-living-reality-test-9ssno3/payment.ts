export function processPayment(amount: number): boolean {
  if (amount <= 0) throw new Error('Amount must be positive');
  return true;
}