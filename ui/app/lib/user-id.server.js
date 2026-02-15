import { randomUUID } from 'node:crypto';

export function getUserId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)rw-uid=([^;]+)/);
  return match ? match[1] : null;
}

export function generateUserId() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

export function buildSetCookie(userId) {
  return `rw-uid=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}
