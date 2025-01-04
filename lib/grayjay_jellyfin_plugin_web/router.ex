defmodule GrayjayJellyfinPluginWeb.Router do
  use GrayjayJellyfinPluginWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {GrayjayJellyfinPluginWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", GrayjayJellyfinPluginWeb do
    pipe_through :browser

    get "/", PageController, :home
    post "/", PageController, :home
    get "/qr_code/*url", PageController, :qr_code
    get "/plugin_config/:uri", PageController, :config
  end

  # Other scopes may use custom stacks.
  # scope "/api", GrayjayJellyfinPluginWeb do
  #   pipe_through :api
  # end
end
