/**
 * A typed application error that carries an HTTP status code.
 *
 * Why this matters: without this, every catch block has to guess whether the
 * error was a "user did something wrong" error (4xx) or a "server broke" error (5xx).
 * Guessing wrong means production bugs get hidden behind misleading status codes.
 *
 * Usage in a service:
 *   throw new AppError(409, 'Email already in use');
 *
 * Usage in a controller:
 *   catch (err) {
 *     if (err instanceof AppError) res.status(err.statusCode).json({ error: err.message });
 *     else res.status(500).json({ error: 'Internal server error' });
 *   }
 *
 * LEARN: extending the built-in Error class is standard Node.js practice for typed errors.
 * The `instanceof` check works because AppError is a real class, not just an object.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
