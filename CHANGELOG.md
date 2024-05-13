# 2.1.1

* Added error check when Dev Drive is located inside `${{ github.workspace }}`.

# 2.1.0

* Added input option `mount-if-exists` to allow mounting pre-existing VHDX drives (e.g. from `actions/cache`).

# 2.0.0

* The default `drive-type` is now `Dynamic` instead of `Fixed`.

# 1.1.0

* Support `drive-type` input allowing to set the drive allocation to `Fixed` or `Dynamic`.

# 1.0.0

* Initial Release
