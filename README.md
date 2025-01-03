# Grayjay Jellyfin Plugin

Grayjay doesn't offer a way to authenticate with Jellyfin, so this server has become a necessity to achieve this.

Note: This project is in a very early state and currently not in a usable state.

## Usage
In order to add a plugin for your personal server it has to be exposed to a public domain, if you want to access
it externally. To add a plugin for your own server you have to start the server and access it on port 4000.
There you can enter your the url to your jellyfin server. Scan the generated QR code with your Grayjay app
and start watching your content.


## Roadmap

* [x] Authorization
* [x] Get latest media in Home
* [x] Search function
  * [ ] Shows (Channel)
  * [x] Episodes (Video)
  * [x] Movies (Video)
  * [x] Song artists (Channel)
  * [ ] Staff/Actors (Channel)
  * [ ] Albums (Playlist)
* [ ] Media Playback 
  * [x] Audio playback
  * [x] Video playback - Not quite there yet
    * [ ] Duration is not properly shown in player
  * [x] Subttile playback
* [ ] Creators
  * [x] Series as Channel
  * [ ] Actors
  * [ ] Song interpreters
* [ ] Playlists
  * [ ] Import own Playlists
  * [ ] Seasons as playlists
  * [ ] Albums as playlists

# Development

## Plugin code
The code for the plugin itself can be found under `/priv/static/js/client.js`. 

## Start the server

In order to start developing you need to start the software. 

1) Please be sure to have (Elixir)[https://elixir-lang.org/install.html] installed.
2) Run `mix setup` to install and setup dependencies
3) Start Phoenix endpoint with `mix phx.server` or inside IEx with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

## Learn more

  * Official website: https://www.phoenixframework.org/
  * Guides: https://hexdocs.pm/phoenix/overview.html
  * Docs: https://hexdocs.pm/phoenix
  * Forum: https://elixirforum.com/c/phoenix-forum
  * Source: https://github.com/phoenixframework/phoenix
