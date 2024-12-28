let config = {};
const PLATFORM = 'Jellyfin';

source.enable = function(conf) {
  config = conf;
  console.log(authHeaders());
  return config;
}

source.searchSuggestions = function() {
  return [];
}

source.getHome = function(continuationToken) {
  const resp = jsonRequest(toUrl("/Shows/NextUp?fields=DateCreated"), "Could not fetch latest updates");
  
  const videos = resp.body.Items.map(function(item) {
    return new PlatformVideo({
      id: new PlatformID(PLATFORM, item.Id, config.id),
      name: item.Name,
      thumbnails: new Thumbnails([new Thumbnail(toUrl(`/Items/${item.Id}/Images/Primary?fillWidth=480&quality=90`))]),
      uploadDate: new Date(item.DateCreated).getTime() / 1000,
      url: `${config.constants.host}/Items/${item.Id}?type=Video`,
      duration: Math.round(item.RunTimeTicks / 10_000_000),
      isLive: false,
      author: new PlatformAuthorLink(new PlatformID(PLATFORM, item.SeriesId, config.id),
        item.SeriesName,
        toUrl(`/Items/${item.SeriesId}?type=Series`),
        toUrl(`/Items/${item.SeriesId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
      )
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

  // TODO: Apply batching

  const details = jsonRequest(toUrl(`/Items/${itemId}?fields=DateCreated`)).body;
  const mediaSources = jsonRequest(toUrl(`/Items/${itemId}/PlaybackInfo`)).body;

  switch (details.Type) {
    case "Episode":
      return videoContent(details, mediaSources, itemId);

    case "Audio":
      return audioContent(details, mediaSources, itemId);
  }
}

function extractSources(mediaSource, itemId) {
  let sources = [];
  let subtitles = [];

  for (const mediaStream of mediaSource.MediaStreams) {
    if (mediaStream.Type == "Video") {
      sources.push(new VideoUrlSource({
        codec: mediaStream.codec,
        name: mediaStream.DisplayTitle,
        width: mediaStream.Width,
        height: mediaStream.Height,
        duration: Math.round(mediaSource.RunTimeTicks / 10_000_000),
        container: `video/${mediaSource.container}`,
      }));
    }

    if (mediaStream.Type == "Audio") {
      sources.push(new AudioUrlSource({
        name: mediaStream.Type,
        bitrate: mediaStream.Bitrate,
        container: mediaStream.Container,
        duration: Math.round(mediaSource.RunTimeTicks / 10_000_000),
        url: toUrl(`/Audio/${itemId}/stream`)
      }));
    }

    if (mediaStream.Type == "Subtitle") {
      const url =  toUrl(`/Videos/${details.Id}/${mediaSource.Id}/Subtitles/${mediaStream.Index}/0/Stream.vtt`);
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
  let {sources, subtitles} = extractSources(mediaSources.MediaSources[0], itemId)

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.Id, config.id),
    author: new PlatformAuthorLink(new PlatformID(PLATFORM, details.AlbumId, config.id),
      details.Album,
      toUrl(`/Items/${details.AlbumId}?type=MusicAlbum`),
      toUrl(`/Items/${details.AlbumId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
    ),
    name: details.Name,
    thumbnails: new Thumbnails([new Thumbnail(toUrl(`/Items/${details.Id}/Images/Primary?fillWidth=480&quality=90`))]),
    dateTime: new Date(details.PremiereDate || details.DateCreated).getTime() / 1000,
    duration: Math.round(details.RunTimeTicks / 10_000_000),
    viewCount: null,
    isLive: false,
    description: null,
    subtitles: subtitles,
    video: new UnMuxVideoSourceDescriptor([], sources)
  })
}

function videoContent(details, mediaSources, itemId) {
  let {sources, subtitles} = extractSources(mediaSources.MediaSources[0], itemId)

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.Id, config.id),
    author: new PlatformAuthorLink(new PlatformID(PLATFORM, details.SeriesId, config.id),
      details.SeriesName,
      toUrl(`/Items/${details.SeriesId}?type=Series`),
      toUrl(`/Items/${details.SeriesId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
    ),
    name: details.Name,
    thumbnails: new Thumbnails([new Thumbnail(toUrl(`/Items/${details.Id}/Images/Primary?fillWidth=480&quality=90`))]),
    dateTime: new Date(details.DateCreated).getTime() / 1000,
    duration: Math.round(details.RunTimeTicks / 10_000_000),
    viewCount: null,
    isLive: false,
    description: null,
    subtitles: subtitles,
    video: new VideoSourceDescriptor(sources)
  });
}

source.isChannelUrl = function(url) {
  return isType(url, ["Series", "MusicAlbum"]);
}

source.getChannel = function(url) {
  const req = jsonRequest(url);
  const resp = req.body;
  let parsed = new URL(url);
  parsed.searchParams.set('type', resp.Type);

  console.log(req)

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
      resp.ExternalUrls.forEach((entry) =>  map_push_duplicate(externalUrls, entry.Name, entry.Url));

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
    const resp = jsonRequest(toUrl(`/Search/Hints?searchTerm=${searchTerm}`));

    return resp.body.SearchHints.map((item) => item.Name).filter(onlyUnique);
  } catch(e) {
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

  const resp = jsonRequest(url.toString());

  const entries = resp
    .body
    .SearchHints
    .filter((item) => ["Audio", "Video"].includes(item.MediaType))
    .map((item) => {
      let data = {};
      switch (item.Type) {
        case "Episode":
          data = {
            id: new PlatformID(PLATFORM, item.Id, config.id),
            name: item.Name,
            thumbnails: new Thumbnails([new Thumbnail(toUrl(`/Items/${item.Id}/Images/Primary?fillWidth=480&quality=90`))]),
            // uploadDate: new Date(item.DateCreated).getTime() / 1000,
            url: `${config.constants.host}/Items/${item.Id}?type=Video`,
            duration: Math.round(item.RunTimeTicks / 10_000_000),
            isLive: false,
            author: new PlatformAuthorLink(new PlatformID(PLATFORM, item.SeriesId, config.id),
              item.SeriesName,
              toUrl(`/Items/${item.Id}?type=Series`),
              toUrl(`/Items/${item.SeriesId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
            )
          };
          break;

        case "Audio":
          data = {
            id: new PlatformID(PLATFORM, item.Id, config.id),
            name: item.Name,
            thumbnails: new Thumbnails([new Thumbnail(toUrl(`/Items/${item.Id}/Images/Primary?fillWidth=480&quality=90`))]),
            // uploadDate: new Date(item.DateCreated).getTime() / 1000,
            url: `${config.constants.host}/Items/${item.Id}?type=Audio`,
            duration: Math.round(item.RunTimeTicks / 10_000_000),
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

// HELPERS
function authHeaders() {
  return {
    "authorization": `MediaBrowser Token="${config.constants.token}", Client="${config.constants.client}", Version="${config.constants.version}", DeviceId="${config.constants.device_id}", Device="${config.constants.device_name}"`
  }
}

function toUrl(path) {
  return `${config.constants.host}${path}`;
}

function jsonRequest(url, error) {
  const resp = http.GET(url, authHeaders(), false);

  if (!resp.isOk) {
    throw new ScriptException(error || "Failed to request data from Jellyfin");
  };

  resp.body = JSON.parse(resp.body);
  return resp;
}

function isType(url, types) {
  if (url.startsWith(toUrl("/Items"))) {
    let parsed = new URL(url);
    let type = parsed.searchParams.get("type");

    if (type == null) {
      const tokens = url.split('/');
      const itemId = tokens[tokens.length - 1];
      let resp = jsonRequest(toUrl(`/Items/${itemId}`), "Could not fetch details");

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
