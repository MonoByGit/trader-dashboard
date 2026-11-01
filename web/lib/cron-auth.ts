import { verifyCronBearer } from '../../src/security/production-auth';

export function requireCronAuth(req: Request): boolean {
  return verifyCronBearer(req.headers.get('authorization'));
}
