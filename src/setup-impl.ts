import * as core from '@actions/core'
import { toPlatformPath } from '@actions/core'
import fs from 'fs-extra'
import path from 'node:path'
import {
  EnvVariables,
  ExternalInputs,
  GithubVariables,
  MountPathDriveFormats,
  StateVariables,
  VHDDriveTypes,
  VHDX_EXTENSION,
  WIN_PLATFORM,
} from './constants'
import { create, mount } from './vhd-commands'

async function doDevDriveCommand(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
  mountPath: string,
  mountIfExists: boolean,
  nativeDevDrive: boolean,
): Promise<string> {
  if (mountIfExists) {
    try {
      // Do a check on the Dev Drive
      await fs.access(drivePath, fs.constants.F_OK | fs.constants.R_OK)
    } catch (e) {
      core.debug((e as NodeJS.ErrnoException).message)
      // Fallback to creation...
      mountIfExists = false
      core.warning('Dev Drive did not exist, will create instead.')
    }
  }

  let mountedPath
  if (!mountIfExists) {
    core.info('Creating Dev Drive.')
    mountedPath = await create(
      driveSize,
      driveFormat,
      drivePath,
      driveType,
      mountPath,
      nativeDevDrive,
    )
    core.info('Successfully created Dev Drive.')
  } else {
    core.info('Mounting Dev Drive.')
    mountedPath = await mount(drivePath, mountPath)
    core.info('Successfully mounted Dev Drive.')
  }

  core.debug(`Exporting EnvVar ${EnvVariables.DevDrive}=${mountedPath}`)
  core.exportVariable(EnvVariables.DevDrive, mountedPath)

  core.debug(`Saving State ${StateVariables.DevDrive}=${mountedPath}`)
  core.saveState(StateVariables.DevDrive, mountedPath)

  core.debug(`Exporting EnvVar ${EnvVariables.DevDrivePath}=${drivePath}`)
  core.exportVariable(EnvVariables.DevDrivePath, drivePath)

  core.debug(`Saving State ${StateVariables.DevDrivePath}=${drivePath}`)
  core.saveState(StateVariables.DevDrivePath, drivePath)

  return mountedPath
}

async function doCopyWorkspace(mountedPath: string, drivePath: string) {
  const githubWorkspace = process.env[GithubVariables.GithubWorkspace]
  if (!githubWorkspace) {
    throw new Error('Github Workspace does not exist!')
  }

  const copyFrom = path.resolve(githubWorkspace)
  const copyTo = path.resolve(mountedPath, path.basename(copyFrom))
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filterFunc = (src: string, dst: string) => src !== drivePath

  // Check whether Copy-To is a child of Copy-From
  const relativePath = path.relative(copyFrom, copyTo)
  const isValidDest = relativePath.startsWith('..') || path.isAbsolute(relativePath)
  if (!isValidDest) {
    throw new Error(
      `Cannot copy '${copyFrom}' to a (sub)directory of itself, '${copyTo}'.`,
    )
  }

  // Check Dev Drive is inside the directory we're about to copy
  const isDevDriveInWorkspace = drivePath.startsWith(copyFrom)
  if (isDevDriveInWorkspace) {
    core.warning(
      `Your dev drive '${drivePath}' is located inside the Github Workspace when ${ExternalInputs.WorkspaceCopy} is enabled! Your drive will be filtered out during copying.`,
    )
  }

  core.info(`Copying workspace from '${copyFrom}' to '${copyTo}'.`)
  await fs.copy(copyFrom, copyTo, { filter: filterFunc })

  core.debug(`Exporting EnvVar ${EnvVariables.DevDriveWorkspace}=${copyTo}`)
  core.exportVariable(EnvVariables.DevDriveWorkspace, copyTo)

  core.info('Finished copying workspace.')
}

export async function setup(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
  mountPath: string,
  mountIfExists: boolean,
  copyWorkspace: boolean,
  nativeDevDrive: boolean,
): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    core.info('This action can only run on Windows.')
    return
  }

  // Normalize Drive Path Input
  let normalizedDrivePath = toPlatformPath(drivePath)
  if (!path.isAbsolute(drivePath)) {
    // Default is relative to CWD root
    normalizedDrivePath = path.resolve('/', normalizedDrivePath)
  }
  if (path.extname(normalizedDrivePath) !== VHDX_EXTENSION) {
    throw new Error(`Make sure ${ExternalInputs.DrivePath} ends with ${VHDX_EXTENSION}`)
  }

  // Normalize Mount Path Input
  let normalizedMountPath = toPlatformPath(mountPath)
  if (mountPath) {
    // Check Drive Type
    if (MountPathDriveFormats.has(driveFormat)) {
      // Default is relative to CWD (when it's not absolute)
      normalizedMountPath = path.resolve(normalizedMountPath)
    } else {
      normalizedMountPath = ''
      const allowedMsg = [...MountPathDriveFormats].join(' or ')
      core.warning(
        `${ExternalInputs.DriveFormat}=${driveFormat} must be either ${allowedMsg} when ${ExternalInputs.MountPath} is specified. Using Drive Letter instead.`,
      )
    }
  }
  if (normalizedMountPath) {
    try {
      // Make sure the directory exists
      await fs.mkdir(normalizedMountPath, { recursive: true })
    } catch (e) {
      const errMsg = (e as NodeJS.ErrnoException).message
      throw new Error(
        `Failed to create specified mount path '${normalizedMountPath}' due to ${errMsg}.`,
      )
    }
  }

  // Check Drive Type
  if (!VHDDriveTypes.has(driveType)) {
    const allowedMsg = [...VHDDriveTypes].join(' or ')
    throw new Error(`Make sure ${ExternalInputs.DriveType} is either ${allowedMsg}`)
  }

  const mountedPath = await doDevDriveCommand(
    driveSize,
    driveFormat,
    normalizedDrivePath,
    driveType,
    normalizedMountPath,
    mountIfExists,
    nativeDevDrive,
  )

  if (copyWorkspace) {
    await doCopyWorkspace(mountedPath, normalizedDrivePath)
  }
}
