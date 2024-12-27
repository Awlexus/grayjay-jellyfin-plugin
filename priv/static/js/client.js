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
        toUrl(`/Items?ids=${item.Id}&type=Series`),
        toUrl(`/Items/${item.SeriesId}/Images/Primary?fillWidth=64&fillHeight=64&quality=60`)
      )
    });
  });
  const hasMore = false;
  const context = {};
  
  return new VideoPager(videos, hasMore, context);
}

source.isContentDetailsUrl = function(url) {
  return isType(url, ["Episode", "Video"]);
}

source.getContentDetails = function(url) {
  const parsed = new URL(url);
  const tokens = parsed.pathname.split('/');
  const itemId = tokens[tokens.length - 1];

  // TODO: Apply batching

  const details = jsonRequest(toUrl(`/Items/${itemId}?fields=DateCreated`)).body;

  const mediaSources = jsonRequest(toUrl(`/Items/${itemId}/PlaybackInfo`)).body;
  const mediaSource = mediaSources.MediaSources[0];

  let sources = [];
  let subtitles = [];

  for (const mediaStream of mediaSource.MediaStreams) {
    if (mediaStream.Type == "Video") {
      // console.log(mediaSource.RunTimeTicks)
      // console.log(mediaSource.RunTimeTicks / 1000)
      // console.log(mediaSource.RunTimeTicks / 1_000_000)
      sources.push(new VideoUrlSource({
        codec: mediaStream.codec,
        name: mediaStream.DisplayTitle,
        width: mediaStream.Width,
        height: mediaStream.Height,
        duration: Math.round(mediaSource.RunTimeTicks / 10_000_000),
        container: `video/${mediaSource.container}`,
        url: toUrl(`/Videos/${itemId}/stream`)
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
  

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.id, config.id),
    author: new PlatformAuthorLink(new PlatformID(PLATFORM, details.SeriesId, config.id),
      details.SeriesName,
      toUrl(`/Items?ids=${details.Id}&type=Series`),
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
  return isType(url, ["Series"]);
}

source.getChannel = function(url) {
  const resp = jsonRequest(url);
  const channel = resp.body;
  let parsed = new URL(url);

  url.SearchParams.set('type', channel.Type);

  return new PlatformChannel({
    id: new PlatformID(PLATFORM, channel.Id, config.id),
    name: channel.Name,
    thumbnail: toUrl(`/Items/${item.SeriesId}/Images/Primary?fillWidth=256&fillHeight=256&quality=90`),
    banner: toUrl(`/Items/${item.SeriesId}/Images/BackDrop/0?fillWidth=256&fillHeight=256&quality=90`),
    subscribers: null,
    description: channel.Overview,
    url: url.toString(),
  });
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
