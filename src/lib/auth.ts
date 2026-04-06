import type { AstroCookies } from 'astro';
import { adminAuth } from './firebase-admin';

export type User = {
  id: string;
  email: string;
  name: string;
  avatar: string;
};

export async function getUser(cookies: AstroCookies): Promise<User | null> {
  const token = cookies.get('gf_firebase_token')?.value;
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      id:     decoded.uid,
      email:  decoded.email   ?? '',
      name:   decoded.name    ?? decoded.email ?? '',
      avatar: decoded.picture ?? '',
    };
  } catch {
    return null;
  }
}
