defmodule GrayjayJellyfinPluginWeb.Signature do
  def get_public_key(), do: env("SCRIPT_PUBLIC_KEY")
  def get_signature(), do: env("SCRIPT_SIGNATURE")

  if Mix.env() == :dev do
    def env(name), do: nil
  else
    def env(name), do: System.fetch_env!(name)
  end
end
