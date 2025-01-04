defmodule GrayjayJellyfinPluginWeb.Router do
  use GrayjayJellyfinPluginWeb, :router

  @mix_env Mix.env()

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
    get "/plugin_config/:host", PageController, :config

    if @mix_env == :dev do
      get "/qr_test/*url", PageController, :qr_test
    end
  end

  # Other scopes may use custom stacks.
  # scope "/api", GrayjayJellyfinPluginWeb do
  #   pipe_through :api
  # end
end
