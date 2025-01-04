let config = {};
const PLATFORM = 'Jellyfin';

source.enable = function(conf) {
  config = conf;
  return config;
}

source.disable = function() { }

source.searchSuggestions = function() {
  return [];
}

source.getHome = function(continuationToken) {
  const resp = simpleJsonGet(toUrl("/Shows/NextUp?fields=DateCreated"), "Could not fetch latest updates");

  const videos = resp.body.Items.map(function(item) {
    return new PlatformVideo({
      id: new PlatformID(PLATFORM, item.Id, config.id),
      name: item.Name,
      thumbnails: itemThumbnails(item.Id),
      uploadDate: new Date(item.DateCreated).getTime() / 1000,
      url: `${config.constants.host}/Items/${item.Id}?type=Video`,
      duration: toDuration(item.RunTimeTicks),
      isLive: false,
      author: extractItemAuthor(item)
    });
  });
  const hasMore = false;
  const context = {};

  return new VideoPager(videos, hasMore, context);
}

source.isContentDetailsUrl = function(url) {
  return isType(url, ["Episode", "Video", "Audio"]);
}

source.getContentDetails = function(url) {
  const parsed = new URL(url);
  const tokens = parsed.pathname.split('/');
  const itemId = tokens[tokens.length - 1];

  const playbackDetails = {
    "DeviceProfile": {
      "DirectPlayProfiles": [
        { "Container": "mkv", "VideoCodec": "h264", "Type": "Video" },
        { "Container": "mp4", "VideoCodec": "h264", "Type": "Video" },
        { "Container": "webm", "Type": "Audio" },
        { "Container": "mp3", "Type": "Audio" }
      ],
      "TranscodingProfiles": [
        { "Container": "mp4", "Type": "Video", "VideoCodec": "h264", "AudioCodec": "aac", "Protocol": "hls" },
        { "Container": "mp3", "Type": "Audio", "AudioCodec": "aac", "Protocol": "hls" }
      ]
    }
  }

  const [details, mediaSources] = batchedJSONRequests([
    { url: toUrl(`/Items/${itemId}?fields=DateCreated`) },
    { url: toUrl(`/Items/${itemId}/PlaybackInfo`), body: JSON.stringify(playbackDetails) }
  ])

  switch (details.body.Type) {
    case "Episode":
    case "Movie":
      return videoContent(details.body, mediaSources.body, itemId);

    case "Audio":
      return audioContent(details.body, mediaSources.body, itemId);
  }
}

function extractSources(details, mediaSource, itemId) {
  let sources = [];
  let subtitles = [];
  const hls = mediaSource.TranscodingUrl != null;

  // Use hls streams if media cannot be directly played
  if (hls) {
    sources.push(new HLSSource({
      url: toUrl(mediaSource.TranscodingUrl),
      duration: toDuration(mediaSource.RunTimeTicks),
      priority: true,
      requestModifier: {
        headers: Object.assign(mediaSource.RequiredHttpHeaders, authHeaders())
      }
    }))
  } else {
    // Add each source individually if not possible
    for (const mediaStream of mediaSource.MediaStreams) {
      if (mediaStream.Type == "Video") {
        sources.push(new VideoUrlSource({
          codec: mediaStream.codec,
          name: mediaStream.DisplayTitle,
          width: mediaStream.Width,
          height: mediaStream.Height,
          duration: toDuration(mediaSource.RunTimeTicks),
          container: `video/${mediaSource.Container}`,
          url: toUrl(`/Videos/${itemId}/stream`)
        }));
      }

      if (mediaStream.Type == "Audio") {
        sources.push(new AudioUrlSource({
          name: mediaStream.Type,
          bitrate: mediaStream.Bitrate,
          container: mediaStream.Container,
          duration: toDuration(mediaSource.RunTimeTicks),
          url: toUrl(`/Audio/${itemId}/stream`)
        }));
      }
    }
  }

  for (const mediaStream of mediaSource.MediaStreams) {
    if (mediaStream.Type == "Subtitle") {
      const url = toUrl(`/Videos/${details.Id}/${mediaSource.Id}/Subtitles/${mediaStream.Index}/0/Stream.vtt`);

      subtitles.push({
        name: mediaStream.DisplayTitle,
        url: url,
        format: 'text/vtt',

        getSubtitles() {
          const resp = http.GET(url, authHeaders(), false);

          if (!resp.isOk) {
            throw new ScriptException(error || "Could not fetch subtitles");
          }

          return resp.body;
        }
      })
    }
  }

  return { sources, subtitles }
}

function audioContent(details, mediaSources, itemId) {
  let { sources, _subtitles } = extractSources(details, mediaSources.MediaSources[0], itemId)

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.Id, config.id),
    author: extractItemAuthor(details),
    name: details.Name,
    thumbnails: itemThumbnails(details.AlbumId),
    dateTime: new Date(details.PremiereDate || details.DateCreated).getTime() / 1000,
    duration: toDuration(details.RunTimeTicks),
    viewCount: null,
    isLive: false,
    description: null,
    video: new VideoSourceDescriptor(sources),
    url: toUrl(`/Items/${details.Id}?type=Audio`)
  })
}

function videoContent(details, mediaSources, itemId) {
  let { sources, subtitles } = extractSources(details, mediaSources.MediaSources[0], itemId)

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.Id, config.id),
    author: extractItemAuthor(details),
    name: details.Name,
    thumbnails: itemThumbnails(details.Id),
    dateTime: new Date(details.DateCreated).getTime() / 1000,
    duration: toDuration(details.RunTimeTicks),
    viewCount: null,
    isLive: false,
    description: null,
    subtitles: subtitles,
    video: new VideoSourceDescriptor(sources),
    url: toUrl(`/Items/${details.Id}?type=Video`)
  });
}

source.isChannelUrl = function(url) {
  return isType(url, ["Series", "MusicAlbum"]);
}

source.getChannel = function(url) {
  const req = simpleJsonGet(url);
  const resp = req.body;
  let parsed = new URL(url);
  parsed.searchParams.set('type', resp.Type);

  switch (resp.Type) {
    case "Series":
      return new PlatformChannel({
        id: new PlatformID(PLATFORM, resp.Id, config.id),
        name: resp.Name,
        thumbnail: toUrl(`/Items/${resp.SeriesId}/Images/Primary?fillWidth=256&fillHeight=256&quality=90`),
        banner: toUrl(`/Items/${resp.SeriesId}/Images/BackDrop/0?fillWidth=256&fillHeight=256&quality=90`),
        subscribers: null,
        description: resp.Overview,
        url: parsed.toString(),
      });
    case "MusicAlbum":
      let externalUrls = new Map();
      resp.ExternalUrls.forEach((entry) => map_push_duplicate(externalUrls, entry.Name, entry.Url));

      return new PlatformChannel({
        id: new PlatformID(PLATFORM, resp.Id, config.id),
        name: resp.Name,
        thumbnail: toUrl(`/Items/${resp.SeriesId}/Images/Primary?fillWidth=256&fillHeight=256&quality=90`),
        banner: toUrl(`/Items/${resp.SeriesId}/Images/BackDrop/0?fillWidth=256&fillHeight=256&quality=90`),
        subscribers: null,
        description: resp.Overview,
        url: parsed.toString(),
        links: externalUrls
      });
  }

}

source.searchSuggestions = function(searchTerm) {
  try {
    const resp = simpleJsonGet(toUrl(`/Search/Hints?searchTerm=${searchTerm}`));

    return resp.body.SearchHints.map((item) => item.Name).filter(onlyUnique);
  } catch (e) {
    console.error(e)
    return [];
  }
}

source.getSearchCapabilities = function() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Streams, Type.Feed.Videos],
    sorts: []
  };
};

source.search = function(query, type, order, filters, channelId) {
  let url = new URL(toUrl(`/Search/Hints`));
  url.searchParams.append("SearchTerm", query);

  if (type != null) {
    // TODO
  }

  if (order != null) {
    // TODO
  }

  if (filters != null) {
    // TODO
  }

  if (channelId != null) {
    // TODO
  }

  const resp = simpleJsonGet(url.toString());

  const entries = resp
    .body
    .SearchHints
    .filter((item) => ["Audio", "Video"].includes(item.MediaType))
    .map((item) => {
      let data = {};
      switch (item.Type) {
        case "Episode":
        case "Movie":
          data = {
            id: new PlatformID(PLATFORM, item.Id, config.id),
            name: item.Name,
            thumbnails: itemThumbnails(item.Id),
            // uploadDate: new Date(item.DateCreated).getTime() / 1000,
            url: toUrl(`/Items/${item.Id}?type=Video`),
            duration: toDuration(item.RunTimeTicks),
            isLive: false,
            author: extractItemAuthor(item)
          });

        case "Audio":
          data = {
            id: new PlatformID(PLATFORM, item.Id, config.id),
            name: item.Name,
            thumbnails: itemThumbnails(item.Id),
            // uploadDate: new Date(item.DateCreated).getTime() / 1000,
            url: toUrl(`/Items/${item.Id}?type=Audio`),
            duration: toDuration(item.RunTimeTicks),
            isLive: false,
            author: new PlatformAuthorLink(new PlatformID(PLATFORM, item.AlbumId, config.id),
              item.Album,
              toUrl(`/Items/${item.AlbumId}?type=MusicAlbum`),
              toUrl(`/Items/${item.AlbumId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
            )
          };
          break;
      }
      return new PlatformVideo(data);
    });
  const hasMore = false;
  const context = {};

  // TODO: Add support for pagination
  return new VideoPager(entries, hasMore, context);
}

// Jellyfin does not have comments AFAIK
source.getComments = function(url) {
  return new CommentPager([], false, {});
}

source.getSubComments = function(comment) {
  return new CommentPager([], false, {});
}

// HELPERS
function authHeaders() {
  return {
    "authorization": `MediaBrowser Token="${config.constants.token}", Client="${config.constants.client}", Version="${config.constants.version}", DeviceId="${config.constants.device_id}", Device="${config.constants.device_name}"`
  }
}

function toUrl(path) {
  return `${config.constants.uri}${path}`;
}

function simpleJsonGet(url, error) {
  const resp = simpleGet(url, error);
  resp.body = JSON.parse(resp.body);
  return resp;
}

function simpleGet(url, error) {
  const resp = http.GET(url, authHeaders(), false);

  if (!resp.isOk) {
    throw new ScriptException(error || "Failed to request data from Jellyfin");
  }

  return resp;
}

function batchedJSONRequests(requests, error) {
  // Inject content-type into all headers
  for (const request of requests) {
    request.headers = Object.assign({ 'content-type': "application/json" }, request.headers || {});
  }
  const responses = batchedRequests(requests, error);

  for (const response of responses) {
    response.body = JSON.parse(response.body);
  }

  return responses;
}

function batchedRequests(requests, error) {
  let client = http.batch();

  for (const request of requests) {
    const headers = Object.assign(authHeaders(), request.headers || {});

    if (request.body != null) {
      client.requestWithBody(
        request.method || "POST",
        request.url,
        request.body,
        headers,
        false
      );
    } else {
      client.request(
        request.method || "GET",
        request.url,
        headers,
        false
      );
    }
  }

  const responses = client.execute();

  for (const response of responses) {
    if (!response.isOk) {
      throw new ScriptException(error || "Failed to request data from Jellyfin");
    }
  }

  return responses;
}

function isType(url, types) {
  if (url.startsWith(toUrl("/Items"))) {
    let parsed = new URL(url);
    let type = parsed.searchParams.get("type");

    if (type == null) {
      const tokens = url.split('/');
      const itemId = tokens[tokens.length - 1];
      let resp = simpleJsonGet(toUrl(`/Items/${itemId}`), "Could not fetch details");

      return types.includes(resp.body.Type);
    } else {
      return types.includes(parsed.searchParams.get("type"));
    }
  } else {
    return false;
  }
}

function onlyUnique(value, index, array) {
  return array.indexOf(value) == index;
}

function map_push_duplicate(map, key, value, index) {
  let insertKey = key;

  if (index != null) {
    insertKey = insertKey + ` ${index}`;
  } else {
    index = 1;
  }

  if (map.has(insertKey)) {
    map_push_duplicate(map, key, value, index + 1);
  } else {
    map.set(insertKey, value);
  }
}

function toDuration(runTimeTicks) {
  return Math.round(runTimeTicks / 10_000_000)
}

function extractItemAuthor(item) {
  switch (item.Type) {
    case "Episode":
      return author({itemId: item.SeriesId, name: item.SeriesName, type: "Series"});

    case "Audio":
      if (item.AlbumId) 
        return author({ itemId: item.AlbumId, name: item.Album, type: "Album"});
  }
  return null;
}

function author({ name, itemId, type }) {
  return PlatformAuthorLink(
    new PlatformID(PLATFORM, itemId, config.id),
    name,
    toUrl(`/Items/${itemId}?type=${type}`),
    toUrl(`/Items/${itemId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
  );
}

function itemThumbnails(itemId) {
  let url = new URL(toUrl(`/Items/${itemId}/Images/Primary`));
  url.searchParams.set('quality', '50');

  url.searchParams.set('fillWidth', '240');
  let url1 = url.toString();

  url.searchParams.set('fillWidth', '480');
  let url2 = url.toString();

  url.searchParams.set('quality', '50');
  url.searchParams.set('fillWidth', '720');
  let url3 = url.toString();

  url.searchParams.set('fillWidth', '1080');
  let url4 = url.toString();

  return new Thumbnails([
    new Thumbnail(url1, 240),
    new Thumbnail(url2, 480),
    new Thumbnail(url3, 720),
    new Thumbnail(url4, 1080)
  ])
}

