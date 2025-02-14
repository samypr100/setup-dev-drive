export enum ExternalInputs {
  DriveSize = 'drive-size',
  DriveFormat = 'drive-format',
  DrivePath = 'drive-path',
  DriveType = 'drive-type',
  MountPath = 'mount-path',
  MountIfExists = 'mount-if-exists',
  WorkspaceCopy = 'workspace-copy',
  NativeDevDrive = 'native-dev-drive',
  TrustedDevDrive = 'trusted-dev-drive',
  EnvMapping = 'env-mapping',
}

export enum Cmdlets {
  GetVHD = 'Get-VHD',
  NewVHD = 'New-VHD',
  MountVHD = 'Mount-VHD',
  DismountVHD = 'Dismount-VHD',
}

export enum EnvVariables {
  DevDrive = 'DEV_DRIVE',
  DevDriveWorkspace = 'DEV_DRIVE_WORKSPACE',
  DevDrivePath = 'DEV_DRIVE_PATH',
}

export enum StateVariables {
  DevDrive = EnvVariables.DevDrive,
  DevDrivePath = EnvVariables.DevDrivePath,
}

export enum GithubVariables {
  GithubWorkspace = 'GITHUB_WORKSPACE',
}

export const MountPathDriveFormats = new Set(['ReFS', 'NTFS'])

export const VHDDriveTypes = new Set(['Fixed', 'Dynamic'])

export const NATIVE_DEV_DRIVE_WIN_VERSION = '10.0.22621'

export const POWERSHELL_BIN = 'pwsh.exe'

export const WIN_PLATFORM = 'win32'

export const VHDX_EXTENSION = '.vhdx'

export const DRIVE_LETTER_RE = /^[A-Za-z]:$/
