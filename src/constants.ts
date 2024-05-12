export enum ExternalInputs {
  DriveSize = 'drive-size',
  DriveFormat = 'drive-format',
  DrivePath = 'drive-path',
  DriveType = 'drive-type',
  MountIfExists = 'mount-if-exists',
  WorkspaceCopy = 'workspace-copy',
}

export enum EnvVariables {
  DevDrive = 'DEV_DRIVE',
  DevDriveWorkspace = 'DEV_DRIVE_WORKSPACE',
  DevDrivePath = 'DEV_DRIVE_PATH',
}

export enum StateVariables {
  DevDrivePath = EnvVariables.DevDrivePath,
}

export enum GithubVariables {
  GithubWorkspace = 'GITHUB_WORKSPACE',
}

export const VHDDriveTypes = new Set(['Fixed', 'Dynamic'])

export const NATIVE_DEV_DRIVE_WIN_VERSION = '10.0.22621'

export const POWERSHELL_BIN = 'pwsh.exe'

export const WIN_PLATFORM = 'win32'

export const VHDX_EXTENSION = '.vhdx'
