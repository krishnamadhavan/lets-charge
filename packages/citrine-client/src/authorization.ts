import { citrineRequest, readError } from "./http.js";

export type AuthorizationStatus = "Accepted" | "Blocked";

export type HasuraOptions = {
  url: string;
};

type HasuraPayload = {
  data?: Record<string, unknown>;
  errors?: { message: string }[];
};

async function hasura(
  options: HasuraOptions,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await citrineRequest(new URL(options.url), "POST", { query, variables });
  if (!response.ok) {
    throw new Error(`hasura ${response.status} ${await readError(response)}`.trim());
  }
  const payload = (await response.json()) as HasuraPayload;
  if (payload.errors?.length) {
    throw new Error(`hasura: ${payload.errors.map((error) => error.message).join("; ")}`);
  }
  return payload.data ?? {};
}

/** Upsert CitrineOS Authorization via Hasura. No Authorization Data API on 2.0.0-beta3. */
export async function upsertAuthorization(
  options: HasuraOptions,
  input: { idToken: string; status: AuthorizationStatus; tenantId: number },
): Promise<{ id: number; created: boolean }> {
  const existing = await hasura(
    options,
    `query Auth($idToken: citext!, $tenantId: Int!) {
      Authorizations(where: { idToken: { _eq: $idToken }, tenantId: { _eq: $tenantId } }, limit: 1) {
        id
      }
    }`,
    { idToken: input.idToken, tenantId: input.tenantId },
  );
  const rows = existing.Authorizations;
  const id =
    Array.isArray(rows) && rows[0] && typeof (rows[0] as { id?: unknown }).id === "number"
      ? (rows[0] as { id: number }).id
      : undefined;

  if (id !== undefined) {
    await hasura(
      options,
      `mutation UpdateAuth($id: Int!, $status: String!, $now: timestamptz!) {
        update_Authorizations_by_pk(pk_columns: { id: $id }, _set: { status: $status, updatedAt: $now }) { id }
      }`,
      { id, status: input.status, now: new Date().toISOString() },
    );
    return { id, created: false };
  }

  const inserted = await hasura(
    options,
    `mutation InsertAuth($idToken: citext!, $status: String!, $tenantId: Int!, $now: timestamptz!) {
      insert_Authorizations_one(object: {
        idToken: $idToken, status: $status, tenantId: $tenantId, createdAt: $now, updatedAt: $now
      }) { id }
    }`,
    {
      idToken: input.idToken,
      status: input.status,
      tenantId: input.tenantId,
      now: new Date().toISOString(),
    },
  );
  const created = inserted.insert_Authorizations_one as { id?: number } | undefined;
  if (typeof created?.id !== "number") {
    throw new Error("hasura insert authorization: expected id");
  }
  return { id: created.id, created: true };
}
