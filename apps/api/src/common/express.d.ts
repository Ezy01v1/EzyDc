declare global {
  namespace Express {
    interface Request {
      /** Lo rellena AuthGuard. */
      user?: { id: string };
    }
  }
}

export {};
