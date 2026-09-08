import { getChatGPTUser } from '@/app/chatgpt-auth';

const ADMIN_EMAILS = new Set([
  'mark@poopsites.com',
  'austinb@k9cleanup.co',
  'austinb@k9kleanup.co',
  'tylerb@k9kleanup.co',
]);

export function isAuthorizedAdminEmail(email: string) {
  return ADMIN_EMAILS.has(email.toLowerCase());
}

export async function getAuthorizedAdmin() {
  const user = await getChatGPTUser();
  if (!user || !isAuthorizedAdminEmail(user.email)) return null;
  return user;
}
