import { citrineRequest, joinUrl, readError } from "./http.js";

export type CommissionOptions = {
  baseUrl: string;
  tenantId: number;
  bootPath: string;
};

export async function commissionBoot(
  options: CommissionOptions,
  ocppConnectionName: string,
): Promise<void> {
  const url = new URL(joinUrl(options.baseUrl, options.bootPath));
  url.searchParams.set("ocppConnectionName", ocppConnectionName);
  url.searchParams.set("tenantId", String(options.tenantId));
  const response = await citrineRequest(url, "PUT", { status: "Accepted" });
  if (!response.ok) {
    throw new Error(`citrine commission ${response.status} ${await readError(response)}`.trim());
  }
}
