defmodule GrayjayJellyfinPluginWeb.PageController do
  use GrayjayJellyfinPluginWeb, :controller

  alias GrayjayJellyfinPluginWeb.Signature

  @plugin_version 1

  def home(conn, %{"url" => url, "username" => username, "password" => password} = params) do
    host = prepare_host(url)

    case login(host, username, password, Map.get(params, "device_name", "Grayjay client")) do
      {:ok, keys} ->
        url = "grayjay://plugin/" <> url(~p"/plugin_config/#{host}?#{keys}")
        render(conn, :home, host: host, url: url, layout: false)

      :error ->
        conn
        |> put_flash(:error, "Invalid credentials")
        |> render(:home, host: host, url: nil, layout: false)
    end
  end

  def home(conn, _params) do
    url =
      URI.encode(
        "http://192.168.1.11:4000/plugin_config/http%3A%2F%2F192.168.1.8%3A8096?version=0.1.0&token=8b55ac0c208d41e3b17bc98bca8ba2ce&client=Grayjay+client&device_name=Test+Device&device_id=019403eb-362f-7760-ba35-2f30f9cf368c"
      )

    host = "http://192.168.1.8:8096"
    render(conn, :home, host: host, url: url, layout: false)
    # render(conn, :home, host: nil, url: nil, layout: false)
  end

  def config(conn, %{"host" => _host, "token" => _token} = params) do
    {host, query_params} = Map.pop(params, "host")

    json(conn, %{
      name: "Plugin for Jellyfin",
      description: "An unofficial source for your own Jellyfin server",
      author: "awlexus",
      authorUrl: "https://github.com/awlexus",
      sourceUrl: url(~p"/plugin_config/#{host}?#{query_params}"),
      scriptUrl: static_url(conn, "/js/client.js"),
      scriptSignature: Signature.get_signature(),
      scriptPublicKey: Signature.get_public_key(),
      iconUrl: static_url(conn, "/images/jellyfin-logo.svg"),
      version: @plugin_version,
      id: "1d00dfbf-aa8d-4e3a-8d52-d63e5999fe09",
      packages: ["Http"],
      allowEval: false,
      allowUrls: ["everywhere"],
      constants: params
    })
  end

  def login(host, username, password, device_name) do
    body = %{"Username" => username, "Pw" => password}

    header_keys = %{
      client: "Grayjay client",
      version: @plugin_version,
      device_id: UUIDv7.generate(),
      device_name: device_name
    }

    headers = %{
      "Authorization" =>
        ~s(MediaBrowser Client="#{header_keys[:client]}", Version="#{header_keys[:version]}", DeviceId="#{header_keys[:device_id]}", Device="#{header_keys[:device_name]}")
    }

    url = "#{host}/Users/AuthenticateByName"

    case Req.post(url, json: body, headers: headers) do
      {:ok, %Req.Response{status: 200, body: %{"AccessToken" => access_token}}} ->
        {:ok, Map.put(header_keys, :token, access_token)}

      _ ->
        :error
    end
  end

  def qr_code(conn, %{"url" => url}) do
    {:ok, qr_code} =
      "grayjay://plugin/#{url}"
      |> QRCode.create()
      |> QRCode.render(:png)

    send_download(conn, {:binary, qr_code},
      filename: "qr_code.png",
      content_type: "image/png",
      disposition: :inline
    )
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
end
