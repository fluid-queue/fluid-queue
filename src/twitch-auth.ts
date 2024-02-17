import { z } from "zod";
import fs from "fs";
import { settings, fileName as settingsFile } from "./settings.js";
import { RefreshingAuthProvider } from "@twurple/auth";

const InitialTokenScheme = z
  .object({
    accessToken: z.string().optional(),
    refreshToken: z.string().nullable(),
    scope: z.string().array().optional(), // optional when unknown
    expiresIn: z.number().nullable().default(0), // null means lives forever, 0 means unknown
    obtainmentTimestamp: z.number().default(0), // 0 means unknown
  })
  .passthrough();

export type InitialTokenScheme = z.output<typeof InitialTokenScheme>;

export function loadToken(tokensFileName: string): InitialTokenScheme {
  const tokenData = InitialTokenScheme.parse(
    JSON.parse(fs.readFileSync(tokensFileName, "utf-8"))
  );
  if (
    tokenData.accessToken == null ||
    tokenData.accessToken == "" ||
    tokenData.accessToken == "{INITIAL_ACCESS_TOKEN}" ||
    tokenData.accessToken == "INITIAL_ACCESS_TOKEN"
  ) {
    throw new Error(`Invalid ${tokensFileName} file: accessToken not found.`);
  }
  if (
    tokenData.refreshToken == null ||
    tokenData.refreshToken == "" ||
    tokenData.refreshToken == "{INITIAL_REFRESH_TOKEN}" ||
    tokenData.refreshToken == "INITIAL_REFRESH_TOKEN"
  ) {
    throw new Error(`Invalid ${tokensFileName} file: refreshToken not found.`);
  }
  return tokenData;
}

function privateClient() {
  if (
    settings.clientId == null ||
    settings.clientId == "" ||
    settings.clientId == "{YOUR_CLIENT_ID}" ||
    settings.clientId == "YOUR_CLIENT_ID"
  ) {
    throw new Error(`${settingsFile}: Invalid clientId.`);
  }
  if (
    settings.clientSecret == null ||
    settings.clientSecret == "" ||
    settings.clientSecret == "{YOUR_CLIENT_SECRET}" ||
    settings.clientSecret == "YOUR_CLIENT_SECRET"
  ) {
    throw new Error(`${settingsFile}: Invalid clientSecret.`);
  }
  // create the refreshing provider
  return new RefreshingAuthProvider({
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
  });
}

function publicClient(publicClientId: string) {
  // TODO: implement
  throw new Error(`Device code grant flow is not implemented yet`);

  return new RefreshingAuthProvider({
    clientId: publicClientId,
    // note: force clientSecret to be undefined
    clientSecret: undefined as unknown as string,
  });
}

export function setupAuth() {
  if (settings.clientSecret == null) {
    if (settings.clientId != null) {
      // Device code grant flow
      return publicClient(settings.clientId);
    }
    if (globalThis.__build_settings?.publicClientId != null) {
      // Device code grant flow
      return publicClient(globalThis.__build_settings?.publicClientId);
    }
  }

  // tokens already set up and a private client is used
  return privateClient();
}
