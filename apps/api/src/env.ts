export type ApiEnv = {
  host: string;
  port: number;
  databaseUrl: string;
  webhookSecret: string;
  citrine:
    | {
        baseUrl: string;
        tenantId: number;
        subscriptionPath: string;
        remoteStartPath: string;
        remoteStopPath: string;
        bootPath: string;
        hasuraUrl: string | undefined;
        stationId: string;
        webhookUrl: string;
      }
    | undefined;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const databaseUrl = required("DATABASE_URL");
  const webhookSecret = required("CITRINE_WEBHOOK_SECRET");
  const citrineBaseUrl = env.CITRINE_BASE_URL?.trim();

  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 3001),
    databaseUrl,
    webhookSecret,
    citrine: citrineBaseUrl
      ? {
          baseUrl: citrineBaseUrl,
          tenantId: Number(env.CITRINE_TENANT_ID ?? 1),
          subscriptionPath: env.CITRINE_SUBSCRIPTION_PATH ?? "/data/ocpprouter/subscription",
          remoteStartPath:
            env.CITRINE_REMOTE_START_PATH ?? "/ocpp/1.6/evdriver/remoteStartTransaction",
          remoteStopPath:
            env.CITRINE_REMOTE_STOP_PATH ?? "/ocpp/1.6/evdriver/remoteStopTransaction",
          bootPath: env.CITRINE_STATION_COMMISSION_PATH ?? "/data/configuration/boot",
          hasuraUrl: env.CITRINE_HASURA_URL?.trim() || undefined,
          stationId: env.CITRINE_OCPP_STATION_ID ?? "cp001",
          webhookUrl:
            env.CITRINE_WEBHOOK_URL ?? "http://letscharge-api:3001/internal/citrine/ocpp",
        }
      : undefined,
  };
}

export function callbackUrlWithSecret(webhookUrl: string, secret: string): string {
  const url = new URL(webhookUrl);
  url.searchParams.set("secret", secret);
  return url.toString();
}
