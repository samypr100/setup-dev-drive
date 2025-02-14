[![GitHub Actions][github-actions-badge]](https://github.com/samypr100/setup-dev-drive/actions/workflows/main.yml)
[![Release][release-badge]](https://github.com/samypr100/setup-dev-drive/releases)
[![Marketplace][marketplace-badge]](https://github.com/marketplace/actions/setup-dev-drive)
[![License][license-badge]](https://github.com/samypr100/setup-dev-drive/blob/main/LICENSE)
[![Language][typescript-badge]](https://www.typescriptlang.org)
[![OS][windows-badge]](https://learn.microsoft.com/en-us/windows/dev-drive)

[github-actions-badge]: https://github.com/samypr100/setup-dev-drive/actions/workflows/main.yml/badge.svg
[release-badge]: https://img.shields.io/github/release/samypr100/setup-dev-drive.svg
[marketplace-badge]: https://img.shields.io/badge/setup--dev--drive-100000?&label=Marketplace&logo=github
[license-badge]: https://img.shields.io/github/license/samypr100/setup-dev-drive.svg
[typescript-badge]: https://img.shields.io/badge/TypeScript-3178c6?&logo=typescript&logoColor=white
[windows-badge]: https://img.shields.io/badge/Windows%20Only-08a1f7?&logo=windows

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
- uses: samypr100/setup-dev-drive@v3
```

You can optionally pass parameters to the action as follows:

```yaml
- uses: samypr100/setup-dev-drive@v3
  with:
    # Drive size in bytes (or as a PowerShell numeric literal). Defaults to 2GB.
    drive-size: 2GB
    # Drive file system (ReFS, NTFS, etc.). Defaults to ReFS.
    drive-format: ReFS
    # Drive allocation (Dynamic or Fixed). Defaults to Dynamic.
    drive-type: Dynamic
    # Path to VHDX file. Defaults to `/dev_drive.vhdx`
    drive-path: "dev_drive.vhdx"
    # Path to mount the drive. Defaults to creating a new arbitrary drive letter such as "E:".
    mount-path: "my_mount_path"
    # Mounts (rather than create) an existing VHDX in drive-path. Defaults to false.
    mount-if-exists: false
    # Copies ${{ github.workspace }} to your dev drive. Defaults to false.
    workspace-copy: false
    # Use native dev drive support when available. Defaults to true.
    native-dev-drive: true
    # Used to mark the native dev drive as trusted. Defaults to false.
    trusted-dev-drive: false
    # Custom mappings of output environment variables. Defaults to no mapping.
    env-mapping: |
      MY_PROJECT_BIN,{{ DEV_DRIVE }}/path/to/bin
```

This action is [compatible](#runner-compatibility) with `windows-2022` runners or above.

For more examples, take a look in the dedicated [examples section](#examples).

## Configuration

### *drive-size*

By default, this option is set to `2GB`.

Allows you to configure the dev drive size in bytes. This is subject to the limit of space
available on your runner. The default public runners roughly hold about 15GB of
[space](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners/about-github-hosted-runners#standard-github-hosted-runners-for-public-repositories),
so it's suggested you keep your drive size below that limit, or you may encounter errors.

You can use PowerShell built in [Numeric Literals](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_numeric_literals)
functionality to automatically expand expressions like `2GB` to mean `2147483648`.

### *drive-format*

The format of the drive, by default `ReFS` but it can be any of `FAT`, `FAT32`, `exFAT`, `NTFS`, `ReFS`
as provided by [Format-Volume](https://learn.microsoft.com/en-us/powershell/module/storage/format-volume).

### *drive-path*

The path to the dev drive VHDX file, defaults to the relative path `dev_drive.vhdx` under the
current system root.

When a relative path is provided, it will be relative to `C:\`, `D:\` or the default
workspace drive letter on the runner. Hence, `dev_drive.vhdx` will likely resolve to
`C:\dev_drive.vhdx` or `D:\dev_drive.vhdx`.

When an absolute path is provided, make sure it's located outside `${{ github.workspace }}`
otherwise `workspace-copy` will issue a warning. This action will ignore copying the dev drive
in such scenarios.

### *drive-type*

By default, this option is set to `Dynamic`.

Determines the type of drive, `Fixed` or `Dynamic`. There are performance tradeoffs between
both. For the purposes of this action `Dynamic` is used by default for flexibility.

`Dynamic` is useful when you want to cache the disk across job runs as it yields a smaller
payload to cache when the job ends.

`Fixed` gives you a notable performance boost, but there's a small creation overhead.

### *mount-path*

By default, this option is not set and defaults to a new arbitrary drive letter such as `E:`.

Mounts the dev drive at the specified `mount-path` location. This option can be
useful when you want to mount your dev drive inside the GitHub workspace via
`${{ github.workspace }}/my_mount_path`, `my_mount_path`, or equivalent.

This option is only supported when using the `NTFS` or `ReFS` drive formats, otherwise
it will fall back to a drive letter instead. Furthermore, when a relative path is specified
it the mount path will end up being relative to your current working directory.

**Warning**: Setting `mount-path` to exactly `${{ github.workspace }}` and then running
`actions/checkout` will try to wipe your mount folder, causing an error that looks like
`File was unable to be removed Error: EPERM: operation not permitted, lstat '${{ github.workspace }}\System Volume Information'`
See [actions/checkout#430](https://github.com/actions/checkout/issues/430) for more details
on this non-configurable behavior by `actions/checkout`.

In such cases, it is recommended you run `actions/checkout` before this action.
You can also leverage `workspace-copy: true` to copy your contents as long as
your mount path is outside `${{ github.workspace }}`.

### *mount-if-exists*

By default, this option is set to `false`.

Mounts the dev drive if it already exists at `drive-path` location. When it does not exist,
it will fall back to creating one at that location instead. This is useful when your workflow
caches the dev drive for further use in other jobs via `actions/cache`.

### *workspace-copy*

By default, this option is set to `false`.

This copies `${{ github.workspace }}` to your dev drive. Usually when you use `actions/checkout`
it creates a shallow copy of your commit to `${{ github.workspace }}`. When `workspace-copy`
is set to `true`, this action will copy your workspace into your dev drive allowing you move
your workload to be purely on the dev drive.

This option was needed since `actions/checkout` does not allow cloning outside `${{ github.workspace }}`.
See [actions/checkout#197](https://github.com/actions/checkout/issues/197).

This option is compatible with `mount-path` as long as the mount path is not directly located inside your
GitHub workspace (e.g. `${{ github.workspace }}/../my_mount_path`).

### *native-dev-drive*

By default, this option is set to `true`.

This action will automatically use the built-in [Windows Dev Drive](https://learn.microsoft.com/en-us/windows/dev-drive/)
on your behalf when it's available on your Windows runner and `ReFS` is used.
You can use this option to turn this automatic usage off.

### *trusted-dev-drive*

By default, this option is set to `false`.

This action will not mark the dev drive as trusted and will leave it to default settings.
When an additional degree of performance is desired, marking a native dev drive as trusted may help.

Consult [official documentation](https://learn.microsoft.com/en-us/windows/dev-drive/#understanding-security-risks-and-trust-in-relation-to-dev-drive)
before considering enabling this functionality.

### *env-mapping*

By default, this option is not set.

This option provides syntactic sugar to manage the environment variables exposed by this action.

On a particular job, it can be repetitive having to re-declare the environment variables like below.

```yaml
- uses: samypr100/setup-dev-drive@v3
- name: Step A
  env:
    CARGO_HOME: ${{ env.DEV_DRIVE }}/.cargo
    RUSTUP_HOME: ${{ env.DEV_DRIVE }}/.rustup
  run: ...
- name: Step B
  env:
    CARGO_HOME: ${{ env.DEV_DRIVE }}/.cargo
    RUSTUP_HOME: ${{ env.DEV_DRIVE }}/.rustup
  run: ...
- name: Step C
  env:
    CARGO_HOME: ${{ env.DEV_DRIVE }}/.cargo
    RUSTUP_HOME: ${{ env.DEV_DRIVE }}/.rustup
  run: ...
# ...
```

This option allows you to define them once per job as shown in the example below.

It leverages [handlebars](https://handlebarsjs.com/) syntax under the hood to expose the supported
[environment variables](#environment-variables), giving you the ability to create new ones with
their contents after the action runs, so they can be automatically set in subsequent steps.

**Warning**: No canonicalization is performed on the input. The template is substituted as-is with the
typical values of the environment variables and the rest of the input is then appended as-is.

```yaml
- uses: samypr100/setup-dev-drive@v3
  with:
    env-mapping: |
      CARGO_HOME,{{ DEV_DRIVE }}/.cargo
      RUSTUP_HOME,{{ DEV_DRIVE }}/.rustup
- name: Step A
  run: ...
- name: Step B
  run: ...
- name: Step C
  run: ...
# ...
```

## Exported Environment Variables

These environment variables are meant to be used along `working-directory` to make sure
your workflow commands are executing relative to your dev drive.

#### *DEV_DRIVE*

Contains the path to your dev drive of the form `<DRIVE_LETTER>:` or the canonical `mount-path`.
For example, if the dev drive assigned letter is `E`, `${{ env.DEV_DRIVE }}` will contain `E:`.

When `mount-path` is set, the value will be the resolved canonical path of the mount path.
For example if your specified mount path is `my_mount_path`, the value will look like
`D:\a\path\to\my_mount_path`.

This env var is always set.

#### *DEV_DRIVE_WORKSPACE*

When `workspace-copy` is set to true, this contains the workspace location as represented
by the dev drive location. For example if your GitHub workspace is `D:\a\<project-name>\<project-name>`
your dev drive workspace will be `E:\<project-name>` by default assuming the drive letter is `E`.

When `mount-path` is set, this behaves the same as described above with the caveat that the `mount-path`
location must be outside your GitHub workspace (e.g. `${{ github.workspace }}/../my_mount_path`).

This env var is only set **if-only-if** `workspace-copy` option is set. Otherwise, it's expected that
you'd use `DEV_DRIVE` env var instead.

#### *DEV_DRIVE_PATH*

The canonical location of the VHDX file.

When `drive-path` is set to a relative path like `my_drive.vhdx`
the location in this variable will likely be `D:\my_drive.vhdx`.

When `drive-path` is set to an absolute path like `D:\path\to\my_drive.vhdx`
the location in this variable will be the same but normalized as given by
[path.normalize](https://nodejs.org/api/path.html#pathnormalizepath).

This env var is always set.

## Examples

### Setting working directory to use Dev Drive workspace

```yaml
- uses: actions/checkout@v4
- uses: samypr100/setup-dev-drive@v3
  with:
    workspace-copy: true
- name: Install dependencies in dev drive
  working-directory: ${{ env.DEV_DRIVE_WORKSPACE }}
  run: npm install
```

### Installing software inside Dev Drive root

```yaml
- uses: samypr100/setup-dev-drive@v3
- name: Install rust toolchain in dev drive
  env:
    CARGO_HOME: ${{ env.DEV_DRIVE }}/.cargo
    RUSTUP_HOME: ${{ env.DEV_DRIVE }}/.rustup
  run: rustup show
```

### Caching the Dev Drive

Inspired by [actions/cache#752 (comment)](https://github.com/actions/cache/issues/752#issuecomment-1847036770)

```yaml
- uses: actions/checkout@v4
- uses: actions/cache@v4
  with:
    path: "C:\\bazel_cache.vhdx"
    key: bazel-cache-windows
- uses: samypr100/setup-dev-drive@v3
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
