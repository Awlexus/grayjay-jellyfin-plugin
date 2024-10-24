# Grayjay Jellyfin Plugin

Grayjay doesn't offer a way to authenticate with Jellyfin, so this server has become a necessity to achieve this.

## Usage
In order to add a plugin for your personal server it has to be exposed to a public domain, if you want to access
it externally. To add a plugin for your own server you have to start the server and access it on port 4000.
There you can enter your the url to your jellyfin server. Scan the generated QR code with your Grayjay app
and start watching your content.

## Roadmap

* [ ] Authorization
* [ ] Search function
  * [ ] Shows (Channel)
  * [ ] Episodes (Video)
  * [ ] Movies (Video)
  * [ ] Song artists (Channel)
  * [ ] Staff/Actors (Channel)
  * [ ] Albums (Playlist)
* [ ] Media Playback 
  * [ ] Audio playback
  * [ ] Video playback
* [ ] Creators
  * [ ] Show as channel
  * [ ] Actors
  * [ ] Song interpreters
* [ ] Playlists
  * [ ] Import own Playlists
  * [ ] Seasons as playlists
  * [ ] Albums as playlists

# Development

To start your Phoenix server:

  * Run `mix setup` to install and setup dependencies
  * Start Phoenix endpoint with `mix phx.server` or inside IEx with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

Ready to run in production? Please [check our deployment guides](https://hexdocs.pm/phoenix/deployment.html).

## Learn more

  * Official website: https://www.phoenixframework.org/
  * Guides: https://hexdocs.pm/phoenix/overview.html
  * Docs: https://hexdocs.pm/phoenix
  * Forum: https://elixirforum.com/c/phoenix-forum
  * Source: https://github.com/phoenixframework/phoenix
