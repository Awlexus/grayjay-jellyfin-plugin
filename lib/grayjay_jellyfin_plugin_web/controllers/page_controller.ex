defmodule GrayjayJellyfinPluginWeb.PageController do
  use GrayjayJellyfinPluginWeb, :controller

  def home(conn, %{"url" => url, "username" => username, "password" => password} = params) do
    host = prepare_host(url)

    case login(host, username, password, Map.get(params, "device_name", "Grayjay client")) do
      {:ok, keys} ->
        url = url(~p"/plugin_config/#{host}?#{keys}")

        {:ok, qr_code} =
          url
          |> QRCode.create()
          |> QRCode.render(:svg)

        render(conn, :home, host: host, url: url, qr_code: qr_code, layout: false)

      :error ->
        conn
        |> put_flash(:error, "Invalid credentials")
        |> render(:home, qr_code: nil, host: host, url: nil, layout: false)
    end
  end

  def home(conn, _params) do
    render(conn, :home, qr_code: nil, host: nil, url: nil, layout: false)
  end

  def config(conn, %{"host" => _host, "token" => _token} = params) do
    {host, query_params} = Map.pop(params, "host")

    json(conn, %{
      name: "Plugin for Jellyfin",
      description: "An unofficial source for your own Jellyfin server",
      author: "awlexus",
      authorUrl: "https://github.com/awlexus",
      sourceUrl: url(~p"/plugin_config/#{host}?#{query_params}"),
      scriptUrl: url(~p"/plugin_script/#{host}?#{query_params}"),
      version: 1,
      id: "1d00dfbf-aa8d-4e3a-8d52-d63e5999fe09",
      packages: ["Http"],
      allowEval: false,
      allowUrls: ["everywhere"],
      constants: params
    })
  end

  def script(conn, _) do
    script =
      EEx.eval_string("""
      let config = {};

      function authHeaders() {
        return {
          "authorization": `MediaBrowser Token="${config.constants.token}"`
        }
      }

      source.enable = function(conf) {
        config = conf;

        return config;
      }

      source.searchSuggestions = function() {
        return [];
      }

      source.getHome = function(continuationToken) {
        const resp = http.GET(`${config.constants.host}/Items?sortOrder=Descending&sortBy=DateCreated&in`, authHeaders(), false);
        
        if (!resp.isOk) {
          console.log(resp)
          throw new ScriptException("Could not fetch home");
        }
       
        const videos = JSON.parse(resp.body).Items.map(function(item) {
          console.log(item);

          return new PlatformVideo({
            id: new PlatformID("Jellyfin", item.Id, config.id),
            name: item.Name,
            thumbnails: new Thumbnails([new Thumbnail(`${config.constants.host}/Items/${item.Id}/Primary`)]),
            uploadDate: new Date(item.DateCreated).getTime() / 1000,
            url: `${config.constants.host}/items/${item.Id}`,
            isLive: false
          });
        });
        const hasMore = false;
        const context = { continuationToken };
        
        return new VideoPager(videos, hasMore, context);
      }
      """)

    send_resp(conn, 200, script)
  end

  def login(host, username, password, device_name) do
    body = %{"Username" => username, "Pw" => password}

    header_keys = %{
      client: "Grayjay client",
      version: 1,
      device_id: UUIDv7.generate(),
      device_name: device_name
    }

    headers = %{
      "Authorization" =>
        ~s(MediaBrowser Client="#{header_keys[:client]}", Version="#{header_keys[:version]}", DeviceId="#{header_keys[:device_id]}", Device="#{header_keys[:device_name]}")
    }

    url = "#{host}/Users/AuthenticateByName"

    dbg()

    case Req.post(url, json: body, headers: headers) do
      {:ok, %Req.Response{status: 200, body: %{"AccessToken" => access_token}}} ->
        {:ok, Map.put(header_keys, :token, access_token)}

      _ ->
        :error
    end
    |> dbg()
  end

  defp prepare_host(url) do
    uri = URI.new!(url)

    uri = %URI{
      uri
      | path: nil,
        query: nil,
        fragment: nil,
        userinfo: nil,
        scheme: uri.scheme || "https",
        host: uri.host || uri.path
    }

    to_string(uri)
  end

  def script_auth(conn, _) do
    conn.cookies |> dbg()

    case conn.cookies["authorization"] |> dbg() do
      [header] ->
        json(conn, %{header: header})

      _ ->
        conn
        |> put_status(401)
        |> json(%{error: %{message: "Unauthorized. Please log in"}})
    end
  end
end
