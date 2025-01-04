defmodule Mix.Tasks.Signature do
  @moduledoc "Print the current public key and signature used for signing the script"
  @shortdoc "Print the signature data"

  use Mix.Task

  alias GrayjayJellyfinPluginWeb.Signature

  @impl Mix.Task
  def run(args) do
    {options, _, _} =
      OptionParser.parse(args, strict: [signature: :boolean, public_key: :boolean])

    case options do
      [{:signature, true}] ->
        Mix.shell().info(Signature.get_signature())

      [{:public_key, true}] ->
        Mix.shell().info(Signature.get_public_key())

      _ ->
        Mix.shell().info("""
        Signature:
        #{Signature.get_signature()}

        Public key:
        #{Signature.get_public_key()}
        """)
    end
  end
end
