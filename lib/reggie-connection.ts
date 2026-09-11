import { getAdminPlatformEnvironment } from "@/lib/admin-platform";

function runtimeEnvValue(env: object, key: string) {
  return Reflect.get(env, key);
}

export async function getReggieConnection() {
  const values = await getAdminPlatformEnvironment();
  return {
    url: String(runtimeEnvValue(values, "REGGIE_CONNECT_URL") ?? "https://connect.scooper.site").replace(/\/$/, ""),
    siteId: String(runtimeEnvValue(values, "REGGIE_CONNECT_SITE_ID") ?? "").trim(),
    token: String(runtimeEnvValue(values, "REGGIE_CONNECT_SITE_TOKEN") ?? "").trim(),
  };
}
