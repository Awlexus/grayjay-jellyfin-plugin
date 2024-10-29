defmodule GrayjayJellyfinPluginWeb.PageController do
  use GrayjayJellyfinPluginWeb, :controller

  def home(conn, params) do
    {qr_code, host} =
      case params do
        %{"url" => url} ->
          uri = URI.parse(url)
          host = uri.host
          url = url(~p"/plugin_config/#{host}")

          {:ok, qr_code} =
            url
            |> QRCode.create()
            |> QRCode.render(:svg)

          {qr_code, url}

        _ ->
          {nil, nil}
      end

    # The home page is often custom made,
    # so skip the default app layout.
    conn
    |> assign(:qr_code, qr_code)
    |> assign(:host, host)
    |> render(:home, layout: false)
  end

  def config(conn, %{"host" => host}) do
    json(conn, %{
      name: "Plugin for Jellyfin",
      description: "An unofficial source for your own Jellyfin server",
      author: "awlexus",
      authorUrl: "https://github.com/awlexus",
      scriptUrl: ~p"/plugin_script/#{host}",
      version: 1,
      id: "1d00dfbf-aa8d-4e3a-8d52-d63e5999fe09",
      packages: ["Http"],
      allowEval: false,
      allowUrls: [host, conn.host],
      authentication: %{
        loginUrl: url(~p"/login/#{host}"),
        domainHeadersToFind: %{
          host => ["authorization"]
        }
      }
    })
  end

  def script(conn, %{"host" => host}) do
    script =
      EEx.eval_string(
        """
        const endpoint = 'https://<%= host %>'

        source.enable = function() {

        }

        source.searchSuggestions = function() {
          return [];
        }

        source.getHome = function(continuationToken) {
          const resp = http.GET(`${endpoint}/Items?sortOrder=Descending&sortBy=DateCreated`, {}, true);

          if (!resp.isOk) {
            console.log(resp)
            throw new ScriptException("Could not fetch home");
          }

          const videos = JSON.parse(resp.body).Items.map((item) => new PlatformVideo({
            id: new PlatformId("Jellyfin", item.Id, config.id),
            name: item.Name,
            thumbnails: [],
            uploadDate: new Date(item.DateCreated).getTime() / 1000,
            url: `${host}/items/${item.id}`,
            isLive: false
          }));
          const hasMore = false;
          const context = { continuationToken };

          return new VideoPager(videos, hasMore, context);
        }
        """,
        host: host
      )

    send_resp(conn, 200, script)
  end

  def login(conn, %{"host" => host, "username" => username, "password" => password} = params) do
    # TODO: For this to work we also need an api token. See https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
    dbg(conn.req_headers)

    result =
      Req.post(
        url: "https://#{host}/Users/AuthenticateByName",
        json: %{"Username" => username, "Pw" => password},
        headers: %{
          authorization:
            ~s(MediaBrowser Client="Grayjay Plugin", Version="0.1", DeviceId="first device", Device="Cool device")
        }
      )

    case result do
      {:ok, %Req.Response{status: 200, body: %{"AccessToken" => access_token}}} ->
        conn
        |> put_flash(:info, "Successfully signed in")
        |> put_resp_header("authorization", access_token)
        |> render("login.html", host: host)

      _ ->
        render("login.html", host: host)
    end
  end

  def login(conn, %{"host" => host}) do
    render(conn, "login.html", host: host)
  end
end
