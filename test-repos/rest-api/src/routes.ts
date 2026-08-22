export interface RouteHandler {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: (req: unknown) => Promise<unknown>;
}

export function registerRoute(route: RouteHandler): void {
  // register route
}

export function createRouter(): { routes: RouteHandler[] } {
  return { routes: [] };
}
