const path = require('node:path');

const CLIENT_PATH = path.resolve(__dirname, '..', 'client.js');

class SimpleModel {
  constructor(obj) {
    Object.assign(this, obj || {});
  }
}

function installGlobals(httpImpl) {
  const original = {
    source: global.source,
    http: global.http,
    ContentPager: global.ContentPager,
    CommentPager: global.CommentPager,
    ScriptException: global.ScriptException,
    PlatformID: global.PlatformID,
    PlatformAuthorLink: global.PlatformAuthorLink,
    PlatformVideo: global.PlatformVideo,
    PlatformVideoDetails: global.PlatformVideoDetails,
    PlatformChannel: global.PlatformChannel,
    PlatformPlaylist: global.PlatformPlaylist,
    PlatformPlaylistDetails: global.PlatformPlaylistDetails,
    VideoSourceDescriptor: global.VideoSourceDescriptor,
    UnMuxVideoSourceDescriptor: global.UnMuxVideoSourceDescriptor,
    VideoUrlSource: global.VideoUrlSource,
    AudioUrlSource: global.AudioUrlSource,
    HLSSource: global.HLSSource,
    Thumbnails: global.Thumbnails,
    Thumbnail: global.Thumbnail,
    Type: global.Type,
  };

  global.source = {};
  global.http = httpImpl;
  global.ContentPager = class ContentPager {
    constructor(results, hasMore) {
      this.results = results;
      this.hasMore = hasMore;
    }
  };
  global.CommentPager = class CommentPager {
    constructor(results, hasMore, context) {
      this.results = results;
      this.hasMore = hasMore;
      this.context = context;
    }
  };
  global.ScriptException = class ScriptException extends Error {};
  global.PlatformID = class PlatformID {
    constructor(platform, id, pluginId) {
      this.platform = platform;
      this.value = id;
      this.pluginId = pluginId;
    }
  };

  global.PlatformAuthorLink = SimpleModel;
  global.PlatformVideo = SimpleModel;
  global.PlatformVideoDetails = SimpleModel;
  global.PlatformChannel = SimpleModel;
  global.PlatformPlaylist = SimpleModel;
  global.PlatformPlaylistDetails = SimpleModel;
  global.VideoSourceDescriptor = class VideoSourceDescriptor {
    constructor(videoSourcesOrObj) {
      if (Array.isArray(videoSourcesOrObj)) {
        this.videoSources = videoSourcesOrObj;
      } else {
        Object.assign(this, videoSourcesOrObj || {});
      }
    }
  };
  global.UnMuxVideoSourceDescriptor = class UnMuxVideoSourceDescriptor {
    constructor(videoSourcesOrObj, audioSources) {
      this.isUnMuxed = true;
      if (Array.isArray(videoSourcesOrObj)) {
        this.videoSources = videoSourcesOrObj;
        this.audioSources = audioSources || [];
      } else {
        const obj = videoSourcesOrObj || {};
        this.videoSources = obj.videoSources || [];
        this.audioSources = obj.audioSources || [];
      }
    }
  };
  global.VideoUrlSource = class VideoUrlSource extends SimpleModel {
    constructor(obj) {
      super(obj);
      this.plugin_type = 'VideoUrlSource';
    }
  };
  global.AudioUrlSource = class AudioUrlSource extends SimpleModel {
    constructor(obj) {
      super(obj);
      this.plugin_type = 'AudioUrlSource';
    }
  };
  global.HLSSource = class HLSSource extends SimpleModel {
    constructor(obj) {
      super(obj);
      this.plugin_type = 'HLSSource';
    }
  };

  global.Thumbnails = class Thumbnails {
    constructor(sources) {
      this.sources = sources || [];
    }
  };

  global.Thumbnail = class Thumbnail {
    constructor(url, quality) {
      this.url = url;
      this.quality = quality;
    }
  };

  global.Type = {
    Feed: {
      Mixed: 'MIXED',
      Streams: 'STREAMS',
      Videos: 'VIDEOS',
    },
  };

  return () => {
    Object.assign(global, original);
  };
}

function createMockHttp({ getQueue = [], batchQueue = [] } = {}) {
  const state = {
    getCalls: [],
    batchRequests: [],
  };

  const http = {
    GET(url, headers) {
      state.getCalls.push({ url, headers });
      if (getQueue.length === 0) {
        throw new Error(`Unexpected GET: ${url}`);
      }
      return getQueue.shift();
    },
    batch() {
      const queued = [];

      return {
        request(method, url, headers) {
          queued.push({ method, url, headers, body: null });
        },
        requestWithBody(method, url, body, headers) {
          queued.push({ method, url, headers, body });
        },
        execute() {
          state.batchRequests.push(queued.slice());

          if (batchQueue.length === 0) {
            throw new Error('Unexpected batch.execute() call');
          }

          return batchQueue.shift();
        },
      };
    },
  };

  return { http, state };
}

function loadClient(httpImpl) {
  const restore = installGlobals(httpImpl);
  delete require.cache[CLIENT_PATH];
  const client = require(CLIENT_PATH);

  return {
    client,
    restore,
  };
}

function defaultConfig(uri = 'https://jf.example') {
  return {
    id: 'plugin-test',
    constants: {
      uri,
      token: 'token-123',
      client: 'GrayjayTests',
      version: '1.0.0',
      device_id: 'device-123',
      device_name: 'Grayjay Test Device',
    },
  };
}

module.exports = {
  createMockHttp,
  loadClient,
  defaultConfig,
};
