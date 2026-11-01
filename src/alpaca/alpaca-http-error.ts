export class AlpacaHttpError extends Error {
  readonly status: number;

  constructor(
    readonly method: 'GET' | 'POST' | 'DELETE',
    readonly url: string,
    status: number,
    readonly body: string,
  ) {
    super(`Alpaca ${method} ${url}: ${status} ${body}`);
    this.name = 'AlpacaHttpError';
    this.status = status;
  }
}
