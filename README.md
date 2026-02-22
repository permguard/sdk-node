# The official Node.js SDK for Permguard

[![GitHub License](https://img.shields.io/github/license/permguard/sdk-node)](https://github.com/permguard/sdk-node?tab=Apache-2.0-1-ov-file#readme)
[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/permguard)](https://x.com/intent/follow?original_referer=https%3A%2F%2Fdeveloper.x.com%2F&ref_src=twsrc%5Etfw%7Ctwcamp%5Ebuttonembed%7Ctwterm%5Efollow%7Ctwgr%5ETwitterDev&screen_name=Permguard)

[![Documentation](https://img.shields.io/website?label=Docs&url=https%3A%2F%2Fwww.permguard.com%2F)](https://www.permguard.com/)
[![Build, test and publish the artifacts](https://github.com/permguard/sdk-node/actions/workflows/sdk-node-ci.yml/badge.svg)](https://github.com/permguard/sdk-node/actions/workflows/sdk-node-ci.yml)

[![Watch the video on YouTube](https://raw.githubusercontent.com/permguard/permguard-assets/refs/heads/main/video/permguard-thumbnail-preview.png)](https://youtu.be/cH_boKCpLQ8?si=i1fWFHT5kxQQJoYN)

[Watch the video on YouTube](https://youtu.be/cH_boKCpLQ8?si=i1fWFHT5kxQQJoYN)

The Permguard Node.js SDK provides a simple and flexible client to perform authorization checks against a Permguard Policy Decision Point (PDP) service using gRPC.
Please refer to the [Permguard Documentation](https://www.permguard.com/) for more information.

---

## Prerequisites

- **Node.js 20.x or later**
- **TypeScript 5.8 or later** (if using TypeScript)

---

## Installation

Run the following command to install the SDK:

```bash
npm install permguard
```

or with Yarn:

```bash
yarn add permguard
```

---

## Usage Example

Below is a sample TypeScript code demonstrating how to create a Permguard client, build an authorization request using a builder pattern, and process the authorization response:

```typescript
import {
  PrincipalBuilder,
  AZAtomicRequestBuilder,
  withEndpoint,
  AZClient,
} from "permguard";

// Create a new Permguard client
const azClient = new AZClient(withEndpoint("localhost", 9094));

// Create the Principal
const principal = new PrincipalBuilder("amy.smith@acmecorp.com").build();

// Create the entities
const entities = [
  {
    uid: {
      type: "PharmaAuthZFlow::Platform::BranchInfo",
      id: "subscription",
    },
    attrs: {
      active: true,
    },
    parents: [],
  },
];

// Create a new authorization request
const req = new AZAtomicRequestBuilder(
  583438038653,
  "46706cb00ea248d6841cfe2c9f02205b",
  "platform-creator",
  "PharmaAuthZFlow::Platform::Subscription",
  "PharmaAuthZFlow::Platform::Action::create"
)
  .withRequestID("1234")
  .withPrincipal(principal)
  .withEntitiesItems("cedar", entities)
  .withSubjectWorkloadType()
  .withSubjectSource("keycloack")
  .withSubjectProperty("isSuperUser", true)
  .withResourceID("e3a786fd07e24bfa95ba4341d3695ae8")
  .withResourceProperty("isEnabled", true)
  .withActionProperty("isEnabled", true)
  .withContextProperty("time", "2025-01-23T16:17:46+00:00")
  .withContextProperty("isSubscriptionActive", true)
  .build();

// Check the authorization
const { decision, response } = await azClient.check(req);
if (decision) {
  console.log("✅ Authorization Permitted");
} else {
  console.log("❌ Authorization Denied");
  if (response) {
    if (response.Context?.ReasonAdmin) {
      console.log(`-> Reason Admin: ${response.Context.ReasonAdmin.Message}`);
    }
    if (response.Context?.ReasonUser) {
      console.log(`-> Reason User: ${response.Context.ReasonUser.Message}`);
    }
    for (const evaluation of response.Evaluations || []) {
      if (evaluation.Context?.ReasonAdmin) {
        console.log(
          `-> Reason Admin: ${evaluation.Context.ReasonAdmin.Message}`
        );
      }
      if (evaluation.Context?.ReasonUser) {
        console.log(`-> Reason User: ${evaluation.Context.ReasonUser.Message}`);
      }
    }
  }
}
```

---

## Version Compatibility

Our SDK follows a versioning scheme aligned with the Permguard Server versions to ensure seamless integration. The versioning format is as follows:

**SDK Versioning Format:** `x.y.z`

- **x.y**: Indicates the compatible Permguard Server version.
- **z**: Represents the SDK's patch or minor updates specific to that server version.

**Compatibility Examples:**

- `SDK Version 1.3.0` is compatible with `Permguard Server 1.3`.
- `SDK Version 1.3.1` includes minor improvements or bug fixes for `Permguard Server 1.3`.

**Incompatibility Example:**

- `SDK Version 1.3.0` **may not be guaranteed** to be compatible with `Permguard Server 1.4` due to potential changes introduced in server version `1.4`.

**Important:** Ensure that the major and minor versions (`x.y`) of the SDK match those of your Permguard Server to maintain compatibility.

---

Created by [Nitro Agility](https://www.nitroagility.com/).
