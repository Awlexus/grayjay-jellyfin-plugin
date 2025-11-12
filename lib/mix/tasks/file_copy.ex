defmodule Mix.Tasks.FileCopy do
  @moduledoc """
  Listens to file changes of the given file and copies it to another destination when it was updated.

  Can monitor an arbitrary amount of files. Each monitored file should be passed as an argument followed by a destination file
  """
  @shortdoc "Monitors and copies a file to a target"
  use Mix.Task

  @impl Mix.Task
  def run(args) do
    cond do
      Enum.count(args) |> rem(2) != 0 ->
        Mix.shell().error("Each file must be followed by a destination")

      Enum.any?(args, &File.dir?/1) ->
        Mix.shell().error("Cannot watch or copy to directories")

      args |> Enum.take_every(2) |> Enum.all?(&(not File.exists?(&1))) ->
        Mix.shell().error("One of the given files does not exist")

      true ->
        start_listeners(args)
    end
  end

  defp start_listeners(args) do
    args
    |> Enum.take_every(2)
    |> Enum.map(fn path ->
      path
      |> Path.relative_to_cwd()
      |> Path.dirname()
    end)
    |> watch_paths()

    args
    |> Enum.chunk_every(2)
    |> tap(&copy_all/1)
    |> Map.new(fn [from, to] ->
      {from, %{target: to, modified?: false}}
    end)
    |> loop()
  end

  defp watch_paths(paths) do
    {:ok, pid} = FileSystem.start_link(dirs: paths)
    FileSystem.subscribe(pid)
  end

  defp loop(state) do
    receive do
      {:file_event, _, {path, events}} ->
        path = Path.relative_to_cwd(path)
        modified? = :modified in events or state[path][:modified?] == true
        closed? = :closed in events

        cond do
          not Map.has_key?(state, path) ->
            loop(state)

          modified? and closed? ->
            copy(path, state[path].target)
            loop(put_in(state[path].modified?, false))

          modified? ->
            loop(put_in(state[path].modified?, true))

          true ->
            loop(state)
        end

      _ ->
        loop(state)
    end
  end

  defp copy_all(pairs) do
    Enum.each(pairs, fn [from, to] -> copy(from, to) end)
  end

  defp copy(from, to) do
    # Ensure target parent dir exists
    to |> Path.dirname() |> File.mkdir_p!()

    from_mtime = File.stat!(from).mtime

    case File.stat(to) do
      {:ok, %{mtime: to_mtime}} when from_mtime < to_mtime ->
        :ok

      _ ->
        File.cp!(from, to)
    end
  end
end
