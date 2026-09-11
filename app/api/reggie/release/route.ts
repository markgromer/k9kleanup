import { reggieDeploymentIdentity } from "@/generated/reggie-deployment-identity";
import { getAdminPlatformStatus } from "@/lib/admin-platform";

export const dynamic = "force-dynamic";

export async function GET() {
  const builtCommit = reggieDeploymentIdentity.commit.trim().toLowerCase();
  const platformCommit = process.env.RENDER_GIT_COMMIT
    || process.env.CF_PAGES_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.REGGIE_DEPLOY_COMMIT_SHA
    || "";
  const commit = (/^[a-f0-9]{40}$/.test(builtCommit) ? builtCommit : platformCommit).trim().toLowerCase();
  const verified = /^[a-f0-9]{40}$/.test(commit);
  const platformStatus = await getAdminPlatformStatus();
  const storage = {
    database: platformStatus.database === true,
    media: platformStatus.media === true,
    encryption: platformStatus.encryption === true,
    ready: platformStatus.database === true && platformStatus.media === true && platformStatus.encryption === true,
  };
  const healthy = verified && storage.ready;
  return Response.json(
    { ok: healthy, commit: verified ? commit : "", installedVersion: reggieDeploymentIdentity.installedVersion, storage },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
