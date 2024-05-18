[![GitHub Actions][github-actions-badge]](https://github.com/samypr100/setup-dev-drive/actions/workflows/main.yml)

[github-actions-badge]: https://github.com/samypr100/setup-dev-drive/actions/workflows/main.yml/badge.svg

This action primary aim is to create a [Windows Dev Drive](https://learn.microsoft.com/en-us/windows/dev-drive/)
on your behalf and expose its location via GitHub Environment Variables.

Dev Drives use `ReFS` under the hood to provide optimizations that are targeted for developer workflows.
By using a dev drive, you can increase performance significantly on a variety of developer workloads.

Workloads that involve high IO, such as building and testing will see an **improvement of about 25%
or more on average**, which can translate to substantial speed, quota, and cost savings.
See [related blog post](https://devblogs.microsoft.com/visualstudio/devdrive/).

You can still decide to use something else than `ReFS` and get speed benefits of
a [Virtual Hard Disk](https://en.wikipedia.org/wiki/VHD_(file_format)) (VHDX) that
this action creates for you.

## Usage

Just add the following line to the `steps:` list in your GitHub Actions yaml:

```yaml
- uses: samypr100/setup-dev-drive@v2
```

You can optionally pass parameters to the action as follows:

```yaml
- uses: samypr100/setup-dev-drive@v2
  with:
    drive-size: 1GB
    drive-format: ReFS
    drive-type: Dynamic
    drive-path: "dev_drive.vhdx"
    mount-if-exists: false
    workspace-copy: false
```

This action is [compatible](#runner-compatibility) with `windows-2022` runners or above.

For more examples, take a look in the dedicated [examples section](#examples).

## Configuration

#### `drive-size`

Allows you to configure the dev drive size. This is subject to the limit of space
available on your runner. The default public runners roughly hold about 15GB of
[space](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners/about-github-hosted-runners#standard-github-hosted-runners-for-public-repositories),
so it's suggested you keep your drive size below that limit, or you may encounter errors.

#### `drive-format`

The format of the drive, by default `ReFS` but it can be any of `FAT, FAT32, exFAT, NTFS, ReFS`
as provided by [Format-Volume](https://learn.microsoft.com/en-us/powershell/module/storage/format-volume).

#### `drive-path`

The path to the dev drive VHDX file, defaults to the relative path `dev_drive.vhdx`.

When a relative path is provided, it will be relative to `C:\`, `D:\` or the default
workspace drive letter on the runner. Hence, `dev_drive.vhdx` will likely resolve to
`C:\dev_drive.vhdx` or `D:\dev_drive.vhdx`.

When an absolute path is provided, make sure it's located outside `${{ github.workspace }}`
otherwise `workspace-copy` can cause issues. This action will raise an error in such cases.

#### `drive-type`

Determines the type of drive, `Fixed` or `Dynamic`. There are performance tradeoffs between
both. For the purposes of this action `Dynamic` is used by default for flexibility.

`Dynamic` is useful when you want to cache the disk across job runs as it yields a smaller
payload to cache when the job ends.

`Fixed` gives you a notable performance boost, but there's a small creation overhead.

#### `mount-if-exists`

Mounts the dev drive if it already exists at `drive-path` location. When it does not exist,
it will fall back to creating one at that location instead. This is useful when your workflow
caches the dev drive for further use in other jobs via `actions/cache`.

#### `workspace-copy`

This copies `${{ github.workspace }}` to your dev drive. Usually when you use `actions/checkout`
it creates a shallow copy of your commit to `${{ github.workspace }}`. When `workspace-copy`
is set to `true`, this action will copy your workspace into your dev drive allowing you move
your workload to be purely on the dev drive.

This option was needed since `actions/checkout` does not allow cloning outside `${{ github.workspace }}`.
See [actions/checkout#197](https://github.com/actions/checkout/issues/197).

## Environment Variables

These environment variables are meant to be used along `working-directory` to make sure
your workflow commands are executing relative to your dev drive.

#### `DEV_DRIVE`

Contains the path to your dev drive of the form `<DRIVE_LETTER>:`. For example if the dev drive
assigned letter is `E`, `${{ env.DEV_DRIVE }}` will contain `E:`.

#### `DEV_DRIVE_WORKSPACE`

When `workspace-copy` is set to true, this contains the workspace location as represented
by the dev drive location. For example if your GitHub workspace is `D:\a\<project-name>\<project-name>`
your dev drive workspace will be `E:\<project-name>` by default assuming the drive letter is `E`.

#### `DEV_DRIVE_PATH`

The canonical location of the VHDX file.

When `drive-path` is set to a relative path like `my_drive.vhdx`
the location in this variable will likely be `D:\my_drive.vhdx`.

When `drive-path` is set to an absolute path like `D:\path\to\my_drive.vhdx`
the location in this variable will be the same but normalized as given by
[path.normalize](https://nodejs.org/api/path.html#pathnormalizepath).

## Examples

#### Setting working directory to use Dev Drive workspace

```yaml
- uses: actions/checkout@v4
- uses: samypr100/setup-dev-drive@v2
  with:
    workspace-copy: true
- name: Install dependencies in dev drive
  working-directory: ${{ env.DEV_DRIVE_WORKSPACE }}
  run: npm install
```

#### Installing software inside Dev Drive root

```yaml
- uses: samypr100/setup-dev-drive@v2
- name: Install rust toolchain in dev drive
  env:
    CARGO_HOME: ${{ env.DEV_DRIVE }}/.cargo
    RUSTUP_HOME: ${{ env.DEV_DRIVE }}/.rustup
  run: rustup show
```

#### Caching the Dev Drive

Inspired by [actions/cache#752 (comment)](https://github.com/actions/cache/issues/752#issuecomment-1847036770)

```yaml
- uses: actions/checkout@v4
- uses: actions/cache@v4
  with:
    path: "C:\\bazel_cache.vhdx"
    key: bazel-cache-windows
- uses: samypr100/setup-dev-drive@v2
  with:
    drive-path: "C:\\bazel_cache.vhdx"
    drive-format: NTFS
    mount-if-exists: true
- name: Build and test
  run: bazelisk --output_base=$env:DEV_DRIVE test --config=windows //...
# ...
```

## Runner Compatibility

This action currently only works on windows runners. In particular, this
action will only work with `windows-2022` or `windows-latest` runners.

For native dev drive support, `10.0.22621` build or later of windows is required.
This action will gracefully still work even if native dev drive is not available.

On cases where runners may still not be updated to meet the minimum version, you can
still get speed gains by using this action due to `ReFS` and `VHDX` usage.


## Credits

Thanks to Paco Sevilla for the idea to use a VHDX within a GitHub Workflow.
