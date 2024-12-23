let config = {};
const PLATFORM = 'Jellyfin';

source.enable = function(conf) {
  config = conf;
  return config;
}

source.searchSuggestions = function() {
  return [];
}

source.getHome = function(continuationToken) {
  const resp = getRequest(toUrl("/Shows/NextUp?fields=DateCreated"));
  
  if (!resp.isOk) {
    throw new ScriptException("Could not fetch home");
  };
 
  const videos = JSON.parse(resp.body).Items.map(function(item) {
    return new PlatformVideo({
      id: new PlatformID(PLATFORM, item.Id, config.id),
      name: item.Name,
      thumbnails: new Thumbnails([new Thumbnail(toUrl(`/Items/${item.Id}/Images/Primary?fillWidth=480&quality=90`))]),
      uploadDate: new Date(item.DateCreated).getTime() / 1000,
      url: `${config.constants.host}/Items/${item.Id}?type=Video`,
      duration: item.RunTimeTicks / 10_000_000,
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
  return isType(url, ["Video"]);
}

source.isChannelUrl = function(url) {
  return isType(url, ["Series"]);
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

function getRequest(url) {
  console.log(url);
  return http.GET(url, authHeaders(), false);
}

function isType(url, types) {
  if (url.startsWith(toUrl("/Items"))) {
    let parsed = new URL(url);
    let type = parsed.searchParams.get("type");

    if (type == null) {
      parSeriesed.searchParams.append('includeItemTypes', types.join());
      let resp = getRequest(parsed.toString());

      if (!resp.isOk) {
        throw new ScriptException("Unable to verify item details");
      };

      return JSON.parse(resp.body).Items.length == 1;
    } else {
      return types.includes(parsed.searchParams.get("type"));
    }
  } else {
    return false;    
  }
}
