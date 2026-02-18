const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '..', 'JELLYFIN_TEST.json');
const DEFAULT_AUTH_PATH = path.resolve(__dirname, '..', 'JELLYFIN_TEST.auth.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function validateToken(host, token) {
  const response = await fetch(`${host}/Users/Me`, {
    method: 'GET',
    headers: {
      Authorization: `MediaBrowser Token="${token}"`,
    },
  });

  return response.ok;
}

async function authenticate(config, existingDeviceId) {
  const deviceId = existingDeviceId || crypto.randomUUID();
  const deviceName = config.device_name || 'Grayjay plugin contract tests';
  const authHeader = `MediaBrowser Client="GrayjayJellyfinPluginContractTests", Version="1.0.0", DeviceId="${deviceId}", Device="${deviceName}"`;
  const attempts = [
    { Username: config.username, Pw: config.password },
    { Username: config.username, Password: config.password },
  ];
  let lastError = null;

  for (const payload of attempts) {
    const response = await fetch(`${config.host}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text();
      lastError = `Authentication failed with status ${response.status}: ${details}`;
      continue;
    }

    const body = await response.json();
    if (body.AccessToken == null) {
      lastError = 'Authentication response did not include AccessToken';
      continue;
    }

    return {
      access_token: body.AccessToken,
      device_id: body.SessionInfo?.DeviceId || deviceId,
    };
  }

  throw new Error(lastError || 'Authentication failed');
}

async function ensureAuth({ configPath = DEFAULT_CONFIG_PATH, authPath = DEFAULT_AUTH_PATH } = {}) {
  const config = readJson(configPath);
  let auth = readJson(authPath);

  if (!auth.access_token || !(await validateToken(config.host, auth.access_token))) {
    auth = await authenticate(config, auth.device_id);
    writeJson(authPath, auth);
  }

  return {
    config,
    auth,
  };
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  DEFAULT_AUTH_PATH,
  ensureAuth,
};
