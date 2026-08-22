export class Session {
  token: string = '';
  isAdmin: boolean = false;
}

export function authenticateUser(token: string, retries: number = 3): Session {
  if (!token || token.length < 8) {
    throw new Error('Invalid token length');
  }
  return new Session();
}