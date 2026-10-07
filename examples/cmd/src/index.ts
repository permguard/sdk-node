// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import { Client, Refusal } from "@permguard/permguard";

async function main(): Promise<void> {
  const endpoint = process.env.PERMGUARD_PDP_URL ?? "grpc://localhost:7443";
  const client = new Client(endpoint);

  try {
    const response = await client.evaluate({
      zone: "acme",
      ledger: "documents",
      subject: { type: "user", id: "amy@example.com" },
      resource: { type: "document", id: "quarterly-report" },
      action: { name: "read" },
      requestId: "example-1",
    });
    console.log(`permitted: ${response.decision}`);
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(
        `PDP refused the request: class=${error.errorClass} code=${error.code} message=${error.message}`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    client.close();
  }
}

void main();
