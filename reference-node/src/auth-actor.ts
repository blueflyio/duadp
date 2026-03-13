import { createHash } from 'node:crypto';

export interface GitLabActorContext {
  actorId: string;
  actorType: 'token' | 'gitlab-job' | 'gitlab-webhook' | 'system';
  source: 'bearer' | 'gitlab-jwt' | 'gitlab-webhook' | 'anonymous';
  projectPath?: string;
  groupPath?: string;
  subject?: string;
}

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const match = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  );
  if (!match) {
    return undefined;
  }

  const value = match[1];
  return Array.isArray(value) ? value[0] : value;
}

export function actorFromToken(token?: string, fallback = 'system'): string {
  return token ? `auth:${tokenFingerprint(token)}` : fallback;
}

export function actorFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
  fallback = 'system',
): GitLabActorContext {
  const authorization = getHeader(headers, 'authorization');
  const webhookToken = getHeader(headers, 'x-gitlab-token');

  if (webhookToken) {
    return {
      actorId: `gitlab:webhook:${tokenFingerprint(webhookToken)}`,
      actorType: 'gitlab-webhook',
      source: 'gitlab-webhook',
    };
  }

  if (!authorization?.startsWith('Bearer ')) {
    return {
      actorId: fallback,
      actorType: 'system',
      source: 'anonymous',
    };
  }

  const token = authorization.slice(7);
  const claims = decodeJwtPayload(token);
  if (claims && (claims.project_path || claims.namespace_path || claims.sub)) {
    const projectPath = typeof claims.project_path === 'string' ? claims.project_path : undefined;
    const groupPath = typeof claims.namespace_path === 'string' ? claims.namespace_path : undefined;
    const subject = typeof claims.sub === 'string' ? claims.sub : undefined;
    const fingerprintSource = subject || projectPath || token;

    return {
      actorId: `gitlab:job:${tokenFingerprint(fingerprintSource)}`,
      actorType: 'gitlab-job',
      source: 'gitlab-jwt',
      projectPath,
      groupPath,
      subject,
    };
  }

  return {
    actorId: actorFromToken(token, fallback),
    actorType: 'token',
    source: 'bearer',
  };
}
