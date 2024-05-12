import * as core from '@actions/core'
import { toPlatformPath } from '@actions/core'
import { exec, ExecOptions } from '@actions/exec'
import { quote } from 'shell-quote'
import os from 'node:os'
import fs from 'fs-extra'
import path from 'node:path'
import { compare } from 'compare-versions'
import {
  EnvVariables,
  ExternalInputs,
  GithubVariables,
  NATIVE_DEV_DRIVE_WIN_VERSION,
  POWERSHELL_BIN,
  StateVariables,
  VHDDriveTypes,
  VHDX_EXTENSION,
  WIN_PLATFORM,
} from './constants'

function genSetupCommandArgs(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
): string[] {
  const sizeArg = quote([driveSize])
  const formatArg = quote([driveFormat])
  const pathArg = quote([drivePath])

  const osVersion = os.release()
  const supportsDevDrive = compare(os.release(), NATIVE_DEV_DRIVE_WIN_VERSION, '>=')
  core.debug(`Windows Version ${osVersion}. Native Dev Drive? ${supportsDevDrive}`)

  let formatCmd = `Format-Volume -FileSystem ${formatArg} -Confirm:$false -Force ;`
  if (supportsDevDrive && formatArg === 'ReFS') {
    formatCmd = `Format-Volume -DevDrive -Confirm:$false -Force ;`
  }

  const pwshCommand = [
    `$DevDrive = New-VHD -Path ${pathArg} -SizeBytes ${sizeArg} -${driveType} |`,
    'Mount-VHD -Passthru |',
    'Initialize-Disk -Passthru |',
    'New-Partition -AssignDriveLetter -UseMaximumSize |',
    formatCmd,
    `Write-Output ($DevDrive.DriveLetter + ':')`,
  ].join(' ')

  core.debug(`Generated the following command:\n${pwshCommand}`)

  return ['-NoProfile', '-Command', `. {${pwshCommand}}`]
}

async function execSetupCommand(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
): Promise<string> {
  const options: ExecOptions = {}
  let outStr = ''
  let errStr = ''
  options.listeners = {
    stdout: (data: Buffer) => {
      outStr += data.toString()
    },
    stderr: (data: Buffer) => {
      errStr += data.toString()
    },
  }

  const pwshCommandArgs = genSetupCommandArgs(
    driveSize,
    driveFormat,
    drivePath,
    driveType,
  )

  await exec(POWERSHELL_BIN, pwshCommandArgs, options)

  core.debug(`Command stdout:\n${outStr}`)
  core.debug(`Command stderr:\n${errStr}`)

  // Trim because Buffers tend to have newlines.
  const cleanedErr = errStr.trim()
  if (cleanedErr.length > 0) {
    core.error('Failed to created Dev Drive...')
    throw new Error(cleanedErr)
  }

  // Trim because Buffers tend to have newlines.
  const driveLetter = outStr.trim()
  if (driveLetter.length !== 2) {
    core.error(`Failed to recover Dev Drive...`)
    throw new Error('Exit due to unrecoverable state.')
  }

  // Do a check on the Dev Drive
  // If it fails, this will raise an error and the generic handler will take care of it.
  await fs.access(driveLetter, fs.constants.F_OK | fs.constants.W_OK)

  return driveLetter
}

async function doCreateDevDrive(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
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

  core.info('Creating Dev Drive...')
  const driveLetter = await execSetupCommand(
    driveSize,
    driveFormat,
    normalizedDrivePath,
    driveType,
  )

  core.debug(`Exporting EnvVar ${EnvVariables.DevDrive}=${driveLetter}`)
  core.exportVariable(EnvVariables.DevDrive, driveLetter)

  core.debug(`Saving State ${StateVariables.DevDrivePath}=${normalizedDrivePath}`)
  core.saveState(StateVariables.DevDrivePath, normalizedDrivePath)

  core.info('Successfully created Dev Drive...')

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
  copyWorkspace: boolean,
): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    throw new Error('This action can only run on windows.')
  }

  const driveLetter = await doCreateDevDrive(
    driveSize,
    driveFormat,
    drivePath,
    driveType,
  )

  if (copyWorkspace) {
    await doCopyWorkspace(driveLetter)
  }
}
