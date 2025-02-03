# 3.4.1

* Improve logging when marking dev drive as trusted.

# 3.4.0

* Add ability to mark dev drive as trusted.

# 3.3.0

* Add `windows-2025` runner support.
* Change default VHDX size to 2GB.

# 3.2.0

* Add `env-mapping` option to support improved environment variables configuration.

# 3.1.0

* Expose `native-dev-drive` as an option to turn off automatic native Dev Drive usage.
* Documentation improvements.
* Align package.json version.

# 3.0.0

* Allow mounting dev drive in specified mount path (ReFS, NTFS only).
* Workspace copying is no longer restricted by the Dev Drive location.
* Paths in output env vars are no longer escaped `\\`.
* Cleaner error messages.

# 2.2.0

* Improved error handling feedback.
* Additional CI tests.
* More Badges.

# 2.1.2

* Documentation improvements.

# 2.1.1

* Added error check when Dev Drive is located inside `${{ github.workspace }}` when `workspace-copy` is set.

# 2.1.0

* Added input option `mount-if-exists` to allow mounting pre-existing VHDX drives (e.g. from `actions/cache`).

# 2.0.0

* The default `drive-type` is now `Dynamic` instead of `Fixed`.

# 1.1.0

* Support `drive-type` input allowing to set the drive allocation to `Fixed` or `Dynamic`.

# 1.0.0

* Initial Release.
