defmodule GrayjayJellyfinPluginWeb.Signature do
  @moduledoc """
  This module is responsible for generating and updating the keys and signature for the script

  During development the key pair will be automatically generated or loaded from the file system, 
  but in production it must be supplied via environment variables
  """
  @script_file Application.app_dir(:grayjay_jellyfin_plugin, "priv/static/js/client.js")
  @key_file ".ssh/id_rsa"

  @external_resource @key_file
  @external_resource @script_file

  # Load key and signature from env vars
  public_key = System.get_env("SCRIPT_PUBLIC_KEY")
  signature = System.get_env("SCRIPT_SIGNATURE")
  script = File.read!(@script_file)

  {public_key, signature} =
    cond do
      # Check if vars have been set and that it matches the script
      public_key && signature ->
        # TODO: Continue here
        {public_key, signature}

      # If we are not in development we raise and stop the compilation
      not Application.compile_env(:grayjay_jellyfin_plugin, :generate_key, false) ->
        raise "SCRIPT_PUBLIC_KEY or SCRIPT_SIGNATURE environment variable missing"

      true ->
        {private_key, public_key} =
          if File.exists?(".ssh/id_rsa") do
            # Load the existing keys
            private_key =
              @key_file
              |> File.read!()
              |> :public_key.pem_decode()
              |> hd()
              |> :public_key.pem_entry_decode()

            public_key = {:RSAPublicKey, elem(private_key, 2), elem(private_key, 3)}
            {private_key, public_key}
          else
            # Otherwise generate a new keypair
            private_key = :public_key.generate_key({:rsa, 2048, 65537})
            public_key = {:RSAPublicKey, elem(private_key, 2), elem(private_key, 3)}

            private_entry = :public_key.pem_entry_encode(:RSAPrivateKey, private_key)
            File.write!(".ssh/id_rsa", :public_key.pem_encode([private_entry]))

            {private_key, public_key}
          end

        # And calculate the signature
        signature = :public_key.sign(script, :sha512, private_key)

        {public_key, signature}
    end

  if not :public_key.verify(script, :sha512, signature, public_key) do
    raise "Could not verify script signature"
  end

  encoded_public_key =
    :SubjectPublicKeyInfo
    |> :public_key.pem_entry_encode(public_key)
    |> List.wrap()
    |> :public_key.pem_encode()
    |> String.split()
    |> Enum.drop(3)
    |> Enum.drop(-3)
    |> Enum.join()

  def get_public_key(), do: unquote(encoded_public_key)
  def get_signature(), do: unquote(Base.encode64(signature, padding: false))
end
