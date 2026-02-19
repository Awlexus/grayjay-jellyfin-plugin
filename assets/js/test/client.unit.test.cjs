const test = require('node:test');
const assert = require('node:assert/strict');

const { createMockHttp, loadClient, defaultConfig } = require('./harness.cjs');

test('isPlaylistUrl uses query type without detail lookup', () => {
  const mock = createMockHttp();
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const url = 'https://jf.example/Items/abc?type=Playlist';
    assert.equal(runtime.client.isPlaylistUrl(url), true);
    assert.equal(mock.state.getCalls.length, 0);
  } finally {
    runtime.restore();
  }
});

test('isChannelUrl fetches item type from details URL', () => {
  const mock = createMockHttp({
    getQueue: [
      {
        isOk: true,
        body: JSON.stringify({ Type: 'Series' }),
      },
    ],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const url = 'https://jf.example/web/#/details?id=series-1';
    assert.equal(runtime.client.isChannelUrl(url), true);

    assert.equal(mock.state.getCalls.length, 1);
    assert.equal(mock.state.getCalls[0].url, 'https://jf.example/Items/series-1');
  } finally {
    runtime.restore();
  }
});

test('isContentDetailsUrl reads type from hash details URL without HTTP lookup', () => {
  const mock = createMockHttp();
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const url = 'https://jf.example/web/#/details?id=episode-1&type=Episode';
    assert.equal(runtime.client.isContentDetailsUrl(url), true);
    assert.equal(mock.state.getCalls.length, 0);
  } finally {
    runtime.restore();
  }
});

test('isContentDetailsUrl reads type from bang-hash details URL without HTTP lookup', () => {
  const mock = createMockHttp();
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const url = 'https://jf.example/web/index.html#!/details?id=episode-2&type=Episode';
    assert.equal(runtime.client.isContentDetailsUrl(url), true);
    assert.equal(mock.state.getCalls.length, 0);
  } finally {
    runtime.restore();
  }
});

test('isContentDetailsUrl falls back to item lookup only when type is missing', () => {
  const mock = createMockHttp({
    getQueue: [
      {
        isOk: true,
        body: JSON.stringify({ Type: 'Episode' }),
      },
    ],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const url = 'https://jf.example/web/#/details?id=episode-3';
    assert.equal(runtime.client.isContentDetailsUrl(url), true);
    assert.equal(mock.state.getCalls.length, 1);
    assert.equal(mock.state.getCalls[0].url, 'https://jf.example/Items/episode-3');
  } finally {
    runtime.restore();
  }
});

test('batchedRequests merges auth headers into outgoing batch calls', () => {
  const mock = createMockHttp({
    batchQueue: [[{ isOk: true, body: '{}' }, { isOk: true, body: '{}' }]],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const responses = runtime.client.batchedRequests([
      { url: 'https://jf.example/Items/a', headers: { 'x-custom': 'v1' } },
      { url: 'https://jf.example/Items/b', method: 'PUT', body: '{"ok":true}' },
    ]);

    assert.equal(responses.length, 2);

    const [firstBatch] = mock.state.batchRequests;
    assert.equal(firstBatch.length, 2);
    assert.equal(firstBatch[0].method, 'GET');
    assert.equal(firstBatch[0].headers['x-custom'], 'v1');
    assert.ok(firstBatch[0].headers.authorization.includes('Token="token-123"'));
    assert.equal(firstBatch[1].method, 'PUT');
    assert.equal(firstBatch[1].body, '{"ok":true}');
  } finally {
    runtime.restore();
  }
});

test('batchedRequests throws ScriptException on failed response', () => {
  const mock = createMockHttp({
    batchQueue: [[{ isOk: false, body: '{}' }]],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    assert.throws(() => {
      runtime.client.batchedRequests([{ url: 'https://jf.example/Items/a' }]);
    }, /Failed to request data from Jellyfin/);
  } finally {
    runtime.restore();
  }
});

test('extractAuthors caches looked-up authors and avoids duplicate HTTP calls', () => {
  const mock = createMockHttp({
    getQueue: [
      {
        isOk: true,
        body: JSON.stringify({
          Items: [
            {
              Id: 'series-1',
              Type: 'Series',
              Name: 'Series One',
              ImageTags: { Primary: 'img-1' },
            },
          ],
        }),
      },
    ],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const authors = {};
    const items = [
      { Type: 'Episode', SeriesId: 'series-1' },
      { Type: 'Episode', SeriesId: 'series-1' },
    ];

    const first = runtime.client.extractAuthors(items, authors);
    assert.equal(first.length, 2);
    assert.equal(mock.state.getCalls.length, 1);

    const second = runtime.client.extractAuthors(items, authors);
    assert.equal(second.length, 0);
    assert.equal(mock.state.getCalls.length, 1);
  } finally {
    runtime.restore();
  }
});

test('extractAuthors tolerates missing artist/studio arrays', () => {
  const mock = createMockHttp();
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const authors = {};
    const items = [
      { Type: 'Audio', Id: 'audio-1' },
      { Type: 'MusicAlbum', Id: 'album-1', AlbumArtists: null, Artists: null },
      { Type: 'Movie', Id: 'movie-1' },
    ];

    const result = runtime.client.extractAuthors(items, authors);
    assert.deepEqual(result, []);
    assert.equal(mock.state.getCalls.length, 0);
  } finally {
    runtime.restore();
  }
});

test('formatItem maps folders to playlists and media to videos', () => {
  const mock = createMockHttp();
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const playlist = runtime.client.formatItem({
      Type: 'Folder',
      Id: 'folder-1',
      Name: 'Folder One',
      DateCreated: '2024-01-01T00:00:00Z',
      ChildCount: 7,
      ImageTags: { Primary: 'img-1' },
    });

    assert.equal(playlist.name, 'Folder One');
    assert.equal(playlist.videoCount, 7);
    assert.equal(playlist.url, 'https://jf.example/web/#/details?id=folder-1&type=Folder');

    const video = runtime.client.formatItem({
      Type: 'Unknown',
      MediaType: 'Video',
      Id: 'video-1',
      Name: 'Video One',
      RunTimeTicks: 30_000_000,
      UserData: { PlaybackCount: 5 },
      DateCreated: '2024-01-01T00:00:00Z',
    });

    assert.equal(video.name, 'Video One');
    assert.equal(video.duration, 3);
    assert.equal(video.viewCount, 5);
    assert.equal(video.url, 'https://jf.example/web/#/details?id=video-1&type=Video');
  } finally {
    runtime.restore();
  }
});

test('getContentDetails accepts web details URLs and resolves item id', () => {
  const mock = createMockHttp({
    batchQueue: [[
      {
        isOk: true,
        body: JSON.stringify({
          Id: 'video-1',
          Type: 'Movie',
          Name: 'Movie One',
          DateCreated: '2024-01-01T00:00:00Z',
          RunTimeTicks: 30_000_000,
        }),
      },
      {
        isOk: true,
        body: JSON.stringify({
          MediaSources: [
            {
              Id: 'ms-1',
              RunTimeTicks: 30_000_000,
              Container: 'mp4',
              MediaStreams: [],
            },
          ],
        }),
      },
    ]],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    runtime.client.getContentDetails('https://jf.example/web/#/details?id=video-1&type=Video');

    const [firstBatch] = mock.state.batchRequests;
    assert.equal(firstBatch[0].url, 'https://jf.example/Items/video-1?fields=DateCreated');
    assert.equal(firstBatch[1].url, 'https://jf.example/Items/video-1/PlaybackInfo');
  } finally {
    runtime.restore();
  }
});

test('getContentDetails parses item id from /Items URL even with different host', () => {
  const mock = createMockHttp({
    batchQueue: [[
      {
        isOk: true,
        body: JSON.stringify({
          Id: '0aab41166ec0a0feb175c3359d80974c',
          Type: 'Episode',
          Name: 'Episode One',
          DateCreated: '2024-01-01T00:00:00Z',
          RunTimeTicks: 30_000_000,
        }),
      },
      {
        isOk: true,
        body: JSON.stringify({
          MediaSources: [
            {
              Id: 'ms-1',
              RunTimeTicks: 30_000_000,
              Container: 'mp4',
              MediaStreams: [],
            },
          ],
        }),
      },
    ]],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig('https://jellyfin.internal.local'));

    const details = runtime.client.getContentDetails(
      'https://jellyfin.awlex.moe/Items/0aab41166ec0a0feb175c3359d80974c?type=Episode',
    );

    assert.ok(details != null);
    const [firstBatch] = mock.state.batchRequests;
    assert.equal(
      firstBatch[0].url,
      'https://jellyfin.internal.local/Items/0aab41166ec0a0feb175c3359d80974c?fields=DateCreated',
    );
    assert.equal(
      firstBatch[1].url,
      'https://jellyfin.internal.local/Items/0aab41166ec0a0feb175c3359d80974c/PlaybackInfo',
    );
  } finally {
    runtime.restore();
  }
});

test('getPlaylist resolves web details URL to item API and emits web details URL', () => {
  const mock = createMockHttp({
    getQueue: [
      {
        isOk: true,
        body: JSON.stringify({
          Id: 'playlist-1',
          Type: 'Playlist',
          Name: 'Playlist One',
          ImageTags: { Primary: 'img-1' },
        }),
      },
      {
        isOk: true,
        body: JSON.stringify({
          Items: [],
          TotalRecordCount: 0,
        }),
      },
    ],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const playlist = runtime.client.getPlaylist('https://jf.example/web/#/details?id=playlist-1&type=Playlist');

    assert.equal(mock.state.getCalls[0].url, 'https://jf.example/Items/playlist-1');
    assert.equal(playlist.url, 'https://jf.example/web/#/details?id=playlist-1&type=Playlist');
  } finally {
    runtime.restore();
  }
});

test('getChannelContents extracts id from web details URL', () => {
  const mock = createMockHttp({
    getQueue: [
      {
        isOk: true,
        body: JSON.stringify({
          Items: [],
          TotalRecordCount: 0,
        }),
      },
    ],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const pager = runtime.client.getChannelContents('https://jf.example/web/#/details?id=series-42&type=Series');
    assert.equal(pager.results.length, 0);
    assert.equal(mock.state.getCalls[0].url, 'https://jf.example/Items?ParentId=series-42&limit=20');
  } finally {
    runtime.restore();
  }
});

test('JellyfinContentPager applies pagination and hasMore correctly', () => {
  const mock = createMockHttp({
    getQueue: [
      {
        isOk: true,
        body: JSON.stringify({
          Items: [
            {
              Type: 'Folder',
              Id: 'folder-1',
              Name: 'Folder One',
              DateCreated: '2024-01-01T00:00:00Z',
            },
          ],
          TotalRecordCount: 2,
        }),
      },
      {
        isOk: true,
        body: JSON.stringify({
          Items: [
            {
              Type: 'Folder',
              Id: 'folder-2',
              Name: 'Folder Two',
              DateCreated: '2024-01-02T00:00:00Z',
            },
          ],
          TotalRecordCount: 2,
        }),
      },
    ],
  });
  const runtime = loadClient(mock.http);

  try {
    runtime.client.enable(defaultConfig());

    const pager = new runtime.client.JellyfinContentPager({
      url: 'https://jf.example/Items',
      limit: 1,
    });

    assert.equal(pager.hasMore, true);
    assert.equal(pager.currentIndex, 0);

    pager.nextPage();

    assert.equal(pager.currentIndex, 1);
    assert.equal(pager.hasMore, false);
    assert.equal(pager.results.length, 1);
    assert.equal(mock.state.getCalls[1].url, 'https://jf.example/Items?limit=1&startIndex=1');
  } finally {
    runtime.restore();
  }
});
