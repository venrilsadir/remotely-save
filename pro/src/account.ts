import { nanoid } from "nanoid";
import {
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
  type RemotelySavePluginSettings,
  type SUPPORTED_SERVICES_TYPE,
} from "../../src/baseTypes";
import {
  COMMAND_CALLBACK_PRO,
  type FeatureInfo,
  PRO_CLIENT_ID,
  type PRO_FEATURE_TYPE,
  PRO_WEBSITE,
  type ProConfig,
} from "./baseTypesPro";
import { codeVerifier2CodeChallenge } from "./oauth2";

const site = PRO_WEBSITE;
console.debug(`remotelysave official website: ${site}`);

export const DEFAULT_PRO_CONFIG: ProConfig = {
  accessToken: "dummy",
  accessTokenExpiresInMs: 999999999,
  accessTokenExpiresAtTimeMs: 4102444800000,
  refreshToken: "dummy",
  enabledProFeatures: [
    { featureName: "feature-smart_conflict", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-google_drive", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-onedrive_full", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-box", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-pcloud", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-yandex_disk", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-koofr", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-azure_blob_storage", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
  ],
  email: "free-user@remotely-save.local",
};

export const generateAuthUrlAndCodeVerifierChallenge = async (
  hasCallback: boolean
) => {
  const appKey = PRO_CLIENT_ID ?? "cli-"; // hard-code
  const codeVerifier = nanoid(128);
  const codeChallenge = await codeVerifier2CodeChallenge(codeVerifier);
  let authUrl = `${site}/oauth2/authorize?response_type=code&client_id=${appKey}&token_access_type=offline&code_challenge_method=S256&code_challenge=${codeChallenge}&scope=pro.list.read`;
  if (hasCallback) {
    authUrl += `&redirect_uri=obsidian://${COMMAND_CALLBACK_PRO}`;
  }
  return {
    authUrl,
    codeVerifier,
    codeChallenge,
  };
};

export const sendAuthReq = async (
  verifier: string,
  authCode: string,
  errorCallBack: any
) => {
  const appKey = PRO_CLIENT_ID ?? "cli-"; // hard-code
  try {
    const k = {
      code: authCode,
      grant_type: "authorization_code",
      code_verifier: verifier,
      client_id: appKey,
      // redirect_uri: `obsidian://${COMMAND_CALLBACK_PRO}`,
      scope: "pro.list.read",
    };
    // console.debug(k);
    const resp1 = await fetch(`${site}/api/v1/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams(k),
    });
    const resp2 = await resp1.json();
    return resp2;
  } catch (e) {
    console.error(e);
    if (errorCallBack !== undefined) {
      await errorCallBack(e);
    }
  }
};

export const sendRefreshTokenReq = async (refreshToken: string) => {
  const appKey = PRO_CLIENT_ID ?? "cli-"; // hard-code
  try {
    console.info("start auto getting refreshed Remotely Save access token.");
    const resp1 = await fetch(`${site}/api/v1/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: appKey,
        scope: "pro.list.read",
      }),
    });
    const resp2: AuthResError | AuthResSucc = await resp1.json();
    console.info("finish auto getting refreshed Remotely Save access token.");
    return resp2;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

interface AuthResError {
  error: "invalid_request";
}

interface AuthResSucc {
  error: undefined; // needed for typescript
  refresh_token?: string;
  access_token: string;
  expires_in: number;
}

export const setConfigBySuccessfullAuthInplace = async (
  config: ProConfig,
  authRes: AuthResError | AuthResSucc,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  if (authRes.error !== undefined) {
    throw Error(
      `remotely save account auth failed, please auth again: ${authRes.error}`
    );
  }

  config.accessToken = authRes.access_token;
  config.accessTokenExpiresAtTimeMs =
    Date.now() + authRes.expires_in * 1000 - 5 * 60 * 1000;
  config.accessTokenExpiresInMs = authRes.expires_in * 1000;
  config.refreshToken = authRes.refresh_token || config.refreshToken;

  // manually set it expired after 80 days;
  config.credentialsShouldBeDeletedAtTimeMs =
    Date.now() + OAUTH2_FORCE_EXPIRE_MILLISECONDS;

  await saveUpdatedConfigFunc?.();

  console.info(
    "finish updating local info of Remotely Save official website token"
  );
};

export const getAccessToken = async (
  config: ProConfig,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  config.accessToken = "dummy";
  config.accessTokenExpiresAtTimeMs = 4102444800000;
  return "dummy";
};

export const getAndSaveProFeatures = async (
  config: ProConfig,
  pluginVersion: string,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  config.enabledProFeatures = [
    { featureName: "feature-smart_conflict", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-google_drive", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-onedrive_full", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-box", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-pcloud", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-yandex_disk", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-koofr", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-azure_blob_storage", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
  ];
  await saveUpdatedConfigFunc?.();
  return { proFeatures: config.enabledProFeatures };
};

export const getAndSaveProEmail = async (
  config: ProConfig,
  pluginVersion: string,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  config.email = "free-user@remotely-save.local";
  await saveUpdatedConfigFunc?.();
  return { email: config.email };
};

/**
 * If the check doesn't pass, the function should throw the error
 * @returns
 */
export const checkProRunnableAndFixInplace = async (
  config: RemotelySavePluginSettings,
  pluginVersion: string,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
): Promise<true> => {
  console.debug(`checkProRunnableAndFixInplace`);

  if (config.pro === undefined) {
    config.pro = {
      accessToken: "dummy",
      accessTokenExpiresInMs: 999999999,
      accessTokenExpiresAtTimeMs: 4102444800000,
      refreshToken: "dummy",
      enabledProFeatures: [],
      email: "free-user@remotely-save.local",
    };
  }
  if (config.pro.refreshToken === undefined || config.pro.refreshToken === "") {
    config.pro.refreshToken = "dummy";
  }
  if (config.pro.email === undefined || config.pro.email === "") {
    config.pro.email = "free-user@remotely-save.local";
  }

  config.pro.enabledProFeatures = [
    { featureName: "feature-smart_conflict", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-google_drive", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-onedrive_full", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-box", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-pcloud", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-yandex_disk", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-koofr", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
    { featureName: "feature-azure_blob_storage", enableAtTimeMs: 0 as unknown as bigint, expireAtTimeMs: 4102444800000 as unknown as bigint },
  ];

  await saveUpdatedConfigFunc?.();

  const errorMsgs = [];

  // check for smart_conflict
  if (config.conflictAction === "smart_conflict") {
    if (
      config.pro.enabledProFeatures.filter(
        (x) => x.featureName === "feature-smart_conflict"
      ).length === 1
    ) {
      // good to go
    } else {
      errorMsgs.push(
        `You're trying to use "smart conflict" PRO feature but you haven't subscribe to it.`
      );
    }
  } else {
    // good to go
  }

  const toChecked: {
    feature: PRO_FEATURE_TYPE;
    service: SUPPORTED_SERVICES_TYPE;
    name: string;
  }[] = [
    {
      feature: "feature-google_drive",
      service: "googledrive",
      name: "Google Drive",
    },
    {
      feature: "feature-onedrive_full",
      service: "onedrivefull",
      name: "Onedrive (Full)",
    },
    { feature: "feature-box", service: "box", name: "Box" },
    { feature: "feature-pcloud", service: "pcloud", name: "pCloud" },
    {
      feature: "feature-yandex_disk",
      service: "yandexdisk",
      name: "Yandex Disk",
    },
    {
      feature: "feature-koofr",
      service: "koofr",
      name: "Koofr",
    },
    {
      feature: "feature-azure_blob_storage",
      service: "azureblobstorage",
      name: "Azure Blob Storage",
    },
  ];

  for (const { feature, service, name } of toChecked) {
    console.debug(`checking "${feature}", serviceType=${config.serviceType}`);
    if (config.serviceType === service) {
      if (
        config.pro.enabledProFeatures.filter((x) => x.featureName === feature)
          .length === 1
      ) {
        // good to go
      } else {
        errorMsgs.push(
          `You're trying to use "sync with ${name}" PRO feature but you haven't subscribe to it.`
        );
      }
    } else {
      // good to go
    }
  }

  if (errorMsgs.length !== 0) {
    throw Error(errorMsgs.join("\n\n"));
  }

  return true;
};
