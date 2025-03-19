defmodule GrayjayJellyfinPluginWeb.PageController do
  use GrayjayJellyfinPluginWeb, :controller

  alias GrayjayJellyfinPluginWeb.Signature

  @plugin_version 4

  def home(conn, %{"url" => url, "username" => username, "password" => password} = params) do
    host = prepare_host(url)

    device_name =
      case params do
        %{"device_name" => ""} -> "Grayjay client"
        %{"device_name" => device_name} -> device_name
      end

    case login(host, username, password, device_name) do
      {:ok, keys} ->
        url = url(~p"/plugin_config/#{host}?#{keys}")
        render(conn, :home, host: host, url: url, layout: false)

      :error ->
        conn
        |> put_flash(:error, "Invalid credentials")
        |> render(:home, host: host, url: nil, layout: false)
    end
  end

  def home(conn, _params) do
    render(conn, :home, host: nil, url: nil, layout: false)
  end

  def config(conn, %{"uri" => _uri, "token" => _token} = params) do
    {uri, query_params} = Map.pop(params, "uri")
    host = URI.new!(uri).host

    json(conn, %{
      name: "Jellyfin (#{host})",
      description: "An unofficial source for your own Jellyfin server",
      author: "awlexus",
      authorUrl: "https://github.com/awlexus",
      sourceUrl: url(~p"/plugin_config/#{uri}?#{query_params}"),
      scriptUrl: static_url(conn, "/js/client.js"),
      scriptSignature: Signature.get_signature(),
      scriptPublicKey: Signature.get_public_key(),
      iconUrl: static_url(conn, "/images/jellyfin-logo.png"),
      version: @plugin_version,
      id: "1d00dfbf-aa8d-4e3a-8d52-d63e5999fe09-#{host}",
      packages: ["Http"],
      allowEval: false,
      allowUrls: [host, "192.168.1.11"],
      constants: params,
      changelog: changelog()
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

    url = Path.join(host, "Users/AuthenticateByName")

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
    uri = URI.parse(url)

    {host, path} =
      cond do
        is_binary(uri.host) && is_binary(uri.path) ->
          {uri.host, uri.path}

        is_binary(uri.path) and uri.path =~ "/" ->
          [host, path] = String.split(uri.path, "/", parts: 2)
          {host, "/" <> path}

        true ->
          {uri.path, nil}
      end

    uri = %URI{
      uri
      | path: path,
        query: nil,
        fragment: nil,
        userinfo: nil,
        scheme: uri.scheme || "https",
        host: host
    }

    to_string(uri)
  end

  defp changelog() do
    %{
      4 => [
        "Properly fetch Authors in lists",
        "Improve fetching playlist item details",
        "Improve fetching channels contents"
        
      ]
    }
  end
end
