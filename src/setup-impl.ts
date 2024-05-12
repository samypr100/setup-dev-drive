import * as core from '@actions/core'
import { toPlatformPath } from '@actions/core'
import fs from 'fs-extra'
import path from 'node:path'
import {
  EnvVariables,
  ExternalInputs,
  GithubVariables,
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
  mountIfExists: boolean,
): Promise<string> {
  // Normalize User Path Input
  let normalizedDrivePath = toPlatformPath(drivePath)
  if (!path.isAbsolute(drivePath)) {
    normalizedDrivePath = path.resolve('/', normalizedDrivePath)
  }
  if (path.extname(normalizedDrivePath) !== VHDX_EXTENSION) {
    throw new Error(`Make sure ${ExternalInputs.DrivePath} ends with ${VHDX_EXTENSION}`)
  }

  // Check Drive Type
  if (!VHDDriveTypes.has(driveType)) {
    const allowedMsg = [...VHDDriveTypes].join(' or ')
    throw new Error(`Make sure ${ExternalInputs.DriveType} is either ${allowedMsg}`)
  }

  if (mountIfExists) {
    try {
      // Do a check on the Dev Drive
      await fs.access(normalizedDrivePath, fs.constants.F_OK | fs.constants.R_OK)
    } catch (e) {
      core.debug((e as NodeJS.ErrnoException).message)
      // Fallback to creation...
      mountIfExists = false
      core.info('Dev Drive did not exist, will create instead...')
    }
  }

  let driveLetter
  if (!mountIfExists) {
    core.info('Creating Dev Drive...')
    driveLetter = await create(driveSize, driveFormat, normalizedDrivePath, driveType)
    core.info('Successfully created Dev Drive...')
  } else {
    core.info('Mounting Dev Drive...')
    driveLetter = await mount(normalizedDrivePath)
    core.info('Successfully mounted Dev Drive...')
  }

  core.debug(`Exporting EnvVar ${EnvVariables.DevDrive}=${driveLetter}`)
  core.exportVariable(EnvVariables.DevDrive, driveLetter)

  core.debug(`Exporting EnvVar ${EnvVariables.DevDrivePath}=${normalizedDrivePath}`)
  core.exportVariable(EnvVariables.DevDrivePath, normalizedDrivePath)

  core.debug(`Saving State ${StateVariables.DevDrivePath}=${normalizedDrivePath}`)
  core.saveState(StateVariables.DevDrivePath, normalizedDrivePath)

  return driveLetter
}

async function doCopyWorkspace(driveLetter: string) {
  const githubWorkspace = process.env[GithubVariables.GithubWorkspace]
  if (!githubWorkspace) {
    throw new Error(
      'Github Workspace does not exist! Make sure to run `actions/checkout` first.',
    )
  }

  const copyFrom = path.resolve(githubWorkspace)
  const copyTo = path.resolve(driveLetter, path.basename(copyFrom))

  core.info(`Copying workspace from ${copyFrom} to ${copyTo}...`)
  await fs.copy(copyFrom, copyTo)

  core.debug(`Exporting EnvVar ${EnvVariables.DevDriveWorkspace}=${copyTo}`)
  core.exportVariable(EnvVariables.DevDriveWorkspace, copyTo)

  core.info('Finished copying workspace...')
}

export async function setup(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
  mountIfExists: boolean,
  copyWorkspace: boolean,
): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    throw new Error('This action can only run on windows.')
  }

  const driveLetter = await doDevDriveCommand(
    driveSize,
    driveFormat,
    drivePath,
    driveType,
    mountIfExists,
  )

  if (copyWorkspace) {
    await doCopyWorkspace(driveLetter)
  }
}
