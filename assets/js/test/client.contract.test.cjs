const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const { loadClient } = require('./harness.cjs');
const { ensureAuth } = require('./contract_auth.cjs');

function performCurlRequest({ method, url, headers, body }) {
  const args = ['-sS', '-X', method, '-w', '\n%{http_code}'];

  for (const [key, value] of Object.entries(headers || {})) {
    args.push('-H', `${key}: ${value}`);
  }

  if (body != null) {
    args.push('--data-raw', body);
  }

  args.push(url);

  const output = execFileSync('curl', args, { encoding: 'utf8' });
  const splitAt = output.lastIndexOf('\n');
  const responseBody = splitAt >= 0 ? output.slice(0, splitAt) : output;
  const statusText = splitAt >= 0 ? output.slice(splitAt + 1).trim() : '0';
  const status = Number(statusText);

  return {
    isOk: status >= 200 && status < 300,
    body: responseBody,
    status,
  };
}

function createLiveHttp() {
  return {
    GET(url, headers) {
      const response = performCurlRequest({ method: 'GET', url, headers });
      return { isOk: response.isOk, body: response.body };
    },
    batch() {
      const requests = [];

      return {
        request(method, url, headers) {
          requests.push({ method, url, headers, body: null });
        },
        requestWithBody(method, url, body, headers) {
          requests.push({ method, url, headers, body });
        },
        execute() {
          return requests.map((request) => {
            const response = performCurlRequest(request);
            return {
              isOk: response.isOk,
              body: response.body,
            };
          });
        },
      };
    },
  };
}

let runtime;
let setupError = null;

const contract = test;

contract.before(async () => {
  try {
    const { config, auth } = await ensureAuth();
    runtime = loadClient(createLiveHttp());

    runtime.client.enable({
      id: 'plugin-contract',
      constants: {
        uri: config.host,
        token: auth.access_token,
        client: 'GrayjayJellyfinPluginContractTests',
        version: '1.0.0',
        device_id: auth.device_id,
        device_name: config.device_name,
      },
    });
  } catch (error) {
    setupError = error;
  }
});

contract.after(() => {
  if (runtime) {
    runtime.restore();
  }
});

contract('searchSuggestions returns a list for a common query', (t) => {
  if (setupError != null) {
    t.skip(`Contract setup failed: ${setupError.message}`);
    return;
  }

  const suggestions = runtime.client.searchSuggestions('s');

  assert.ok(Array.isArray(suggestions));
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((item) => typeof item === 'string'));
});

contract('home pager loads entries from Jellyfin', (t) => {
  if (setupError != null) {
    t.skip(`Contract setup failed: ${setupError.message}`);
    return;
  }

  const pager = runtime.client.getHome();

  assert.ok(Array.isArray(pager.results));
  assert.ok(pager.results.length > 0);
});

contract('getContentDetails returns a source descriptor for first search result', (t) => {
  if (setupError != null) {
    t.skip(`Contract setup failed: ${setupError.message}`);
    return;
  }

  const suggestionsPager = runtime.client.search('s');
  suggestionsPager.nextPage();

  assert.ok(suggestionsPager.results.length > 0);

  const first = suggestionsPager.results[0];
  assert.ok(first.url.includes('/web/#/details?id='));
  assert.ok(first.url.includes('&type='));
  const details = runtime.client.getContentDetails(first.url);

  assert.ok(details != null);
  assert.ok(details.video != null);
});
