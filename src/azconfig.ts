// Copyright 2025 Nitro Agility S.r.l.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Represents the endpoint for the authorization server.
 */
interface AZEndpoint {
  endpoint: string;
  port: number;
}

/**
 * Represents the configuration for the authorization client.
 */
interface AZConfig {
  pdpEndpoint?: AZEndpoint;
}

/**
 * A function type for configuring the AZConfig.
 */
type AZOption = (config: AZConfig) => void;

/**
 * Sets the gRPC endpoint for the authorization server.
 * @param endpoint - The endpoint (e.g., "localhost").
 * @param port - The port number (e.g., 9094).
 * @returns An AZOption function to configure the AZConfig.
 */
function withEndpoint(endpoint: string, port: number): AZOption {
  return (config: AZConfig) => {
    config.pdpEndpoint = {
      endpoint,
      port,
    };
  };
}

export { type AZEndpoint, type AZConfig, type AZOption, withEndpoint };
