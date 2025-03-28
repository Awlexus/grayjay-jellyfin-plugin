let config = {};
const PLATFORM = "Jellyfin";

source.enable = enable;
source.disable = disable;
source.searchSuggestions = searchSuggestions;
source.getHome = getHome;
source.isContentDetailsUrl = isContentDetailsUrl;
source.getContentDetails = getContentDetails;
source.isChannelUrl = isChannelUrl;
source.getChannel = getChannel;
source.getChannelContents = getChannelContents;
source.isPlaylistUrl = isPlaylistUrl;
source.getPlaylist = getPlaylist;
source.searchSuggestions = searchSuggestions;
source.getSearchCapabilities = getSearchCapabilities;
source.search = search;
source.searchChannels = searchChannels;
source.searchPlaylists = searchPlaylists;
source.getComments = getComments;
source.getSubComments = getSubComments;

class JellyfinContentPager extends ContentPager {
  constructor({ url, type, limit = 20, errorMessage = "Could not fetch items" }) {
    let baseUrl;

    if (url instanceof URL) {
      baseUrl = url;
    } else {
      baseUrl = new URL(url);
    }

    baseUrl.searchParams.set('limit', limit);

    // Fix sorting for music albums
    if (type == "MusicAlbum") {
      baseUrl.searchParams.set('sortBy', 'IndexNumber');
    }

    let body = simpleJsonGet(baseUrl.toString(), errorMessage).body;
    let items = body.Items;
    let authorCache = {};
    let authors = extractAuthors(items, authorCache);
    let entries = formatEntries({ items, authors });
    // let entries = body.Items.map(formatItem);

    const totalItemCount = body.TotalRecordCount;
    super(entries, entries.length < totalItemCount);

    this.url = baseUrl;
    this.limit = limit;
    this.errorMessage = errorMessage;
    this.totalItemCount = totalItemCount;
    this.currentIndex = 0;
    this.authorCache = authorCache;
  }

  nextPage() {
    this.currentIndex += this.limit;
    this.url.searchParams.set('startIndex', this.currentIndex);

    let body = simpleJsonGet(this.url.toString(), this.errorMessage).body;
    let items = body.Items;
    let authors = extractAuthors(items, this.authorCache);
    this.results = formatEntries({ items, authors });
    this.hasMore = this.currentIndex + this.results.length < this.totalItemCount;

    return this;
  }
}

class JellyfinSearchContentPager extends ContentPager {
  // TODO: Do something with these filter options
  constructor({ url = toUrl('/Search/Hints'), query, type, order, filters, channelId, errorMessage = "Search failed", limit = 20 }) {
    let searchUrl = new URL(url);
    searchUrl.searchParams.append("SearchTerm", query);

    const body = simpleJsonGet(searchUrl.toString(), errorMessage).body;
    const items = body.SearchHints.map((hint) => hint.Id);

    super([], items.length > 0);
    this.errorMessage = errorMessage;
    this.items = items;
    this.limit = limit;
    this.authorCache = {};
  }

  nextPage() {
    const requestedItems = this.items.slice(0, this.limit);
    const url = toUrl(`/Items?ids=${requestedItems.join(",")}`);
    let body = simpleJsonGet(url, this.errorMessage).body;
    let items = body.Items;
    let authors = extractAuthors(items, this.authorCache);
    this.results = formatEntries({ items, authors })
    this.items = this.items.slice(this.limit);
    this.hasMore = this.items.length > 0;

    return this;

  }
}

function enable(conf) {
  config = conf;
  return config;
};

function disable() { };

function getHome(continuationToken) {
  return new JellyfinContentPager({
    url: toUrl("/Shows/NextUp?fields=DateCreated"),
    errorMessage: "Could not fetch latest updates",
  });
};

function isContentDetailsUrl(url) {
  return isType(url, ["Episode", "Video", "Audio"]);
};

function getContentDetails(url) {
  const parsed = new URL(url);
  const tokens = parsed.pathname.split("/");
  const itemId = tokens[tokens.length - 1];

  const playbackDetails = {
    DeviceProfile: {
      DirectPlayProfiles: [
        { Container: "mkv", VideoCodec: "h264", Type: "Video" },
        { Container: "mp4", VideoCodec: "h264", Type: "Video" },
        { Container: "webm", Type: "Audio" },
        { Container: "mp3", Type: "Audio" },
      ],
      TranscodingProfiles: [
        {
          Container: "mp4",
          Type: "Video",
          VideoCodec: "h264",
          AudioCodec: "aac",
          Protocol: "hls",
        },
        { Container: "mp3", Type: "Audio", AudioCodec: "aac", Protocol: "hls" },
      ],
    },
  };

  const [details, mediaSources] = batchedJSONRequests([
    { url: toUrl(`/Items/${itemId}?fields=DateCreated`) },
    {
      url: toUrl(`/Items/${itemId}/PlaybackInfo`),
      body: JSON.stringify(playbackDetails),
    },
  ]);

  switch (details.body.Type) {
    case "Episode":
    case "Movie":
      return videoContent(details.body, mediaSources.body, itemId);

    case "Audio":
      return audioContent(details.body, mediaSources.body, itemId);
  }
};

function extractSources(details, mediaSource, itemId) {
  let sources = [];
  let subtitles = [];
  const hls = mediaSource.TranscodingUrl != null;

  // Use hls streams if media cannot be directly played
  if (hls) {
    sources.push(
      new HLSSource({
        url: toUrl(mediaSource.TranscodingUrl),
        duration: toDuration(mediaSource.RunTimeTicks),
        priority: true,
        requestModifier: { headers: mediaSource.RequiredHttpHeaders },
      }),
    );
  } else {
    // Add each source individually if not possible
    for (const mediaStream of mediaSource.MediaStreams) {
      if (mediaStream.Type == "Video") {
        sources.push(
          new VideoUrlSource({
            codec: mediaStream.codec,
            name: mediaStream.DisplayTitle,
            width: mediaStream.Width,
            height: mediaStream.Height,
            duration: toDuration(mediaSource.RunTimeTicks),
            container: `video/${mediaSource.Container}`,
            url: toUrl(`/Videos/${itemId}/stream`),
          }),
        );
      }

      if (mediaStream.Type == "Audio") {
        sources.push(
          new AudioUrlSource({
            name: mediaStream.Type,
            container: mediaStream.Container,
            codec: mediaStream.Codec,
            bitrate: mediaStream.BitRate,
            duration: toDuration(mediaSource.RunTimeTicks),
            url: toUrl(`/Audio/${itemId}/stream`),
          }),
        );
      }
    }
  }

  for (const mediaStream of mediaSource.MediaStreams) {
    if (mediaStream.Type == "Subtitle") {
      const url = toUrl(
        `/Videos/${details.Id}/${mediaSource.Id}/Subtitles/${mediaStream.Index}/0/Stream.vtt`,
      );

      subtitles.push({
        name: mediaStream.DisplayTitle,
        url: url,
        format: "text/vtt",

        getSubtitles() {
          const resp = http.GET(url, authHeaders(), false);

          if (!resp.isOk) {
            throw new ScriptException(error || "Could not fetch subtitles");
          }

          return resp.body;
        },
      });
    }
  }

  return { sources, subtitles };
}

function audioContent(details, mediaSources, itemId) {
  let { sources, _subtitles } = extractSources(
    details,
    mediaSources.MediaSources[0],
    itemId,
  );

  const [author] = extractAuthors([details], {});

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.Id, config.id),
    author: author,
    name: details.Name,
    thumbnails: itemThumbnails(details.AlbumId),
    dateTime:
      new Date(details.PremiereDate || details.DateCreated).getTime() / 1000,
    duration: toDuration(details.RunTimeTicks),
    viewCount: null,
    isLive: false,
    description: null,
    video: new VideoSourceDescriptor(sources),
    url: toUrl(`/Items/${details.Id}?type=Audio`),
  });
}

function videoContent(details, mediaSources, itemId) {
  let { sources, subtitles } = extractSources(
    details,
    mediaSources.MediaSources[0],
    itemId,
  );

  const [author] = extractAuthors([details], {});

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, details.Id, config.id),
    author: author,
    name: details.Name,
    thumbnails: itemThumbnails(details.Id),
    dateTime: new Date(details.DateCreated).getTime() / 1000,
    duration: toDuration(details.RunTimeTicks),
    viewCount: null,
    isLive: false,
    description: null,
    subtitles: subtitles,
    video: new VideoSourceDescriptor(sources),
    url: toUrl(`/Items/${details.Id}?type=Video`),
  });
}

function isChannelUrl(url) {
  // TODO: Add back Person, Studio
  return isType(url, ["Series", "MusicArtist"]);
};

function getChannel(url) {
  const req = simpleJsonGet(url);
  const item = req.body;
  let parsed = new URL(url);
  parsed.searchParams.set("type", item.Type);

  return formatItem(item);
};

function getChannelContents(url) {
  const itemId = urlId(url);

  return new JellyfinContentPager({
    url: toUrl(`/Items?ParentId=${itemId}`),
    errorMessage: "Could not fetch Channel contents",
  });
};

function isPlaylistUrl(url) {
  return isType(url, ["Playlist", "MusicAlbum", "Season", "Folder"]);
};

function getPlaylist(url) {
  let externalUrls = new Map();
  let parsed = new URL(url);

  const item = simpleJsonGet(url).body;
  const [author] = extractAuthors([item], {});
  parsed.searchParams.set("type", item.Type);

  const contents = new JellyfinContentPager({
    type: item.Type,
    url: toUrl(`/Items?ParentId=${item.Id}`),
  });

  return new PlatformPlaylistDetails({
    id: new PlatformID(PLATFORM, item.Id, config.id),
    name: item.Name,
    thumbnail: thumbnail({ item, query: { fillWidth: 240 } }),
    banner: banner({ item }),
    subscribers: null,
    description: item.Overview,
    url: parsed.toString(),
    links: externalUrls,
    author: author,
    contents: contents,
  });
};

function searchSuggestions(searchTerm) {
  try {
    const resp = simpleJsonGet(toUrl(`/Search/Hints?searchTerm=${searchTerm}`));

    return resp.body.SearchHints.map((item) => item.Name).filter(onlyUnique);
  } catch (e) {
    console.error(e);
    return [];
  }
};

function getSearchCapabilities() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Streams, Type.Feed.Videos],
    sorts: [],
  };
};

function search(query, type, order, filters, channelId) {
  const url = toUrl('/Search/Hints?MediaTypes=Video,Audio')

  return new JellyfinSearchContentPager({ url, query, type, order, filters, channelId });
};

function searchChannels(query) {
  // TODO: Add back Person, Studio
  const url = toUrl('/Search/Hints?includeItemTypes=Channel,Genre,MusicArtist,MusicGenre,Series')

  return new JellyfinSearchContentPager({ url, query });
};


// source.searchChannelContents = function (
//   channelUrl,
//   query,
//   type,
//   order,
//   filters,
// ) {
//   return new ParentPaginator(channelUrl, query, type, order, filters);
// };

function searchPlaylists(query, type, order, filters, channelId) {
  const url = toUrl('/Search/Hints?includeItemTypes=Folder,ManualPlaylistsFolder,MusicAlbum,Playlist,PlaylistsFolder,Season')

  return new JellyfinSearchContentPager({ url, query, type, order, filters, channelId })
};

// Jellyfin does not have comments AFAIK
function getComments(url) {
  return new CommentPager([], false, {});
};

function getSubComments(comment) {
  return new CommentPager([], false, {});
};

// HELPERS
function authHeaders() {
  return {
    authorization: `MediaBrowser Token="${config.constants.token}", Client="${config.constants.client}", Version="${config.constants.version}", DeviceId="${config.constants.device_id}", Device="${config.constants.device_name}"`,
  };
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
    request.headers = Object.assign(
      { "content-type": "application/json" },
      request.headers || {},
    );
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
        false,
      );
    } else {
      client.request(request.method || "GET", request.url, headers, false);
    }
  }

  const responses = client.execute();

  for (const response of responses) {
    if (!response.isOk) {
      throw new ScriptException(
        error || "Failed to request data from Jellyfin",
      );
    }
  }

  return responses;
}

function isType(url, types) {
  if (url.startsWith(toUrl("/Items"))) {
    let parsed = new URL(url);
    let type = parsed.searchParams.get("type");

    if (type == null) {
      const tokens = url.split("/");
      const itemId = tokens[tokens.length - 1];
      let resp = simpleJsonGet(
        toUrl(`/Items/${itemId}`),
        "Could not fetch details",
      );

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
  return Math.round(runTimeTicks / 10_000_000);
}

function author(item) {
  return new PlatformAuthorLink(
    new PlatformID(PLATFORM, item.Id, config.id),
    item.Name,
    itemUrl(item),
    thumbnail({ item, query: { fillWidth: 256} })
  );
}

function itemThumbnails(itemId) {
  let url = new URL(toUrl(`/Items/${itemId}/Images/Primary`));
  url.searchParams.set("quality", "50");

  url.searchParams.set("fillWidth", "240");
  let url1 = url.toString();

  url.searchParams.set("fillWidth", "480");
  let url2 = url.toString();

  url.searchParams.set("quality", "50");
  url.searchParams.set("fillWidth", "720");
  let url3 = url.toString();

  url.searchParams.set("fillWidth", "1080");
  let url4 = url.toString();

  return new Thumbnails([
    new Thumbnail(url1, 240),
    new Thumbnail(url2, 480),
    new Thumbnail(url3, 720),
    new Thumbnail(url4, 1080),
  ]);
}

function urlId(url) {
  const segments = new URL(url).pathname.split("/")
  return segments[segments.length - 1];
}

function parseItem(item) {
  switch (item.Type) {
    case "Episode":
    case "Movie":
      // case "MusicVideo":
      // case "Video":
      return new PlatformVideo({
        id: new PlatformID(PLATFORM, item.Id, config.id),
        name: item.Name,
        thumbnails: itemThumbnails(item.Id),
        // uploadDate: new Date(item.DateCreated).getTime() / 1000,
        url: toUrl(`/Items/${item.Id}?type=Video`),
        duration: toDuration(item.RunTimeTicks),
        isLive: false,
      });

    case "Audio":
      return new PlatformVideo({
        id: new PlatformID(PLATFORM, item.Id, config.id),
        name: item.Name,
        thumbnails: item.AlbumId
          ? itemThumbnails(item.AlbumId)
          : itemThumbnails(item.Id),
        // uploadDate: new Date(item.DateCreated).getTime() / 1000,
        url: toUrl(`/Items/${item.Id}?type=Audio`),
        duration: toDuration(item.RunTimeTicks),
        isLive: false,
      });
    case "AudioBook":
      return new PlatformVideo({
        id: new PlatformID(PLATFORM, item.Id, config.id),
        name: item.Name,
        thumbnails: itemThumbnails(item.Id),
        // uploadDate: new Date(item.DateCreated).getTime() / 1000,
        url: toUrl(`/Items/${item.Id}?type=Audio`),
        duration: toDuration(item.RunTimeTicks),
        isLive: false,
      });


    // case "Channel":
    // case "LiveTvChannel":
    case "MusicArtist":
    // case "MusicGenre":
    // case "Person":
    case "Studio":
    case "Series":
      return new PlatformChannel({
        id: new PlatformID(PLATFORM, item.Id, config.id),
        name: item.Name,
        description: item.Overview,
        thumbnail: thumbnail({ item }),
        banner: banner({ item }),
        url: toUrl(`/Items/${item.Id}?type=${item.Type}`),
        links: item.ExternalUrls?.reduce((acc, item) => {
          acc[item.Name] = item.Url;
          return acc;
        }, {})

      });
    // return new

    case "Playlist":
    case "Season":
    case "MusicAlbum":
      // case "Program":
      return new PlatformPlaylist({
        id: new PlatformID(PLATFORM, item.Id, config.id),
        name: item.Name,
        url: toUrl(`/Items/${item.Id}?type=${item.Type}`),
        thumbnail: banner({ item }),
      });
  }
}

function extractAuthors(items, authors) {
  const authorIds = items.map(authorId);
  const uniqueIds = authorIds
    .filter(id => id != null)
    .filter(authorId => !(authorId in authors))
    .filter(onlyUnique);

  if (uniqueIds.length == 0) return [];

  simpleJsonGet(toUrl(`/Items?Ids=${uniqueIds.join(",")}`))
    .body
    .Items
    .forEach((item) => authors[item.Id] = author(item));

  return authorIds.map((id) => id && authors[id]);
}

function authorId(item) {
  switch (item.Type) {
    case "Episode":
    case "Season":
      return item.SeriesId;

    case "Audio":
    case "MusicAlbum":
      if (item.AlbumArtists.length > 0) {
        return item.AlbumArtists[0].Id;
      }

      if (item.Artists.length > 0) {
        return item.Artists[0].Id;
      }
      return null;

    case "Movie":
      if (item.Studios.length > 0) {
        return item.Studios[0].Id;
      }
      return null;

    default:
      return null;
  }
};

function formatEntries({ items, authors }) {
  return zip(items, authors).map(([item, author]) => {
    return formatItem(item, author)
  });
}

function zip(...args) {
  const [first, ...rest] = args;

  return first.map((item, i) => {
    let acc = [item];
    rest.forEach((other) => acc.push(other[i]))
    return acc;
  });
}

function formatItem(item, author) {
  const url = toUrl(`/Items/${item.Id}?type=${item.Type}`);

  switch (item.Type) {
    case "Folder":
    case "ManualPlaylistFolder":
    case "Playlist":
    case "PlaylistsFolder":
    case "MusicAlbum":
    case "Season":
      return new PlatformPlaylist({
        id: itemId(item),
        author: author,
        name: item.Name,
        url: url,
        thumbnail: banner({ item }),
        datetime: parseDate(item.PremiereDate || item.DateCreated),
        videoCount: item.ChildCount
      });

    case "Channel":
    case "Genre":
    case "MusicArtist":
    case "MusicGenre":
    // case "Person":
    case "Series":
    case "Studio":
      return new PlatformChannel({
        id: itemId(item),
        name: item.Name,
        description: item.Overview || item.Description,
        url: url,
        thumbnail: thumbnail({ item, order: ["Logo", "Thumb", "Primary"], query: { fillWidth: 128 } }),
        banner: banner({ item }),
        links: item.ExternalUrls?.reduce((acc, item) => {
          acc[item.Name] = item.Url;
          return acc;
        }, {})
      });

    default:
      switch (item.MediaType) {
        case "Video":
        case "Audio":
          return new PlatformVideo({
            id: itemId(item),
            author: author,
            name: item.Name,
            thumbnails: itemThumbnails(item.Id),
            url: url,
            duration: toDuration(item.RunTimeTicks),
            isLive: false,
            viewCount: item.UserData.PlaybackCount,
            datetime: parseDate(item.PremiereDate || item.DateCreated),
        });

      }
  };
  throw new ScriptException("Unknown item type");
}

function itemId(item) {
  return new PlatformID(PLATFORM, item.Id, config.id);
}

function itemUrl({ Id, Type }) {
  return toUrl(`/Items/${Id}?type=${Type}`)
}

function thumbnail({ item, order = ["Primary", "Logo", "Thumb"], query }) {
  let type;
  let tag;

  if (item.ImageTags != null) {
    type = order.find((type) => type in item.ImageTags);
    tag = item.ImageTags[type];
  } else {
    type = order.find((type) => `${type}ImageTag` in item);

    if (type == null) return null;

    tag = item[`${type}ImageTag`];
  }

  let url = toUrl(`/Items/${item.Id}/Images/${type}?tag=${tag}`);

  return withQuery(url, query);
}

function banner({ item, query }) {
  if (item.BackdropImageTag != null) {
    return withQuery(toUrl(`/Items/${item.Id}/Images/Backdrop?tag=${item.BackdropImageTag}]`), query);
  } else if (item.BackgroundImageTags != null && item.BackdropImageTags.length > 0) {
    return withQuery(toUrl(`/Items/${item.Id}/Images/Backdrop/0?tag=${item.BackdropImageTags[0]}]`), query);
  } else {
    return thumbnail({ item, query });
  }
}

function withQuery(url, query) {
  if (query == null) return url;

  let parsedUrl = new URL(url);
  for (let key in query) parsedUrl.searchParams.append(key, query[key]);
  return parsedUrl.toString();
}

function parseDate(value) {
  return new Date(value).getTime() / 1000;
}
