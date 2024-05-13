import { quote } from 'shell-quote'
import { exec, ExecOptions } from '@actions/exec'
import { NATIVE_DEV_DRIVE_WIN_VERSION, POWERSHELL_BIN } from './constants'
import os from 'node:os'
import { compare } from 'compare-versions'
import * as core from '@actions/core'
import fs from 'fs-extra'

export async function dismount(drivePath: string) {
  const pathArg = quote([drivePath])
  const pwshCommand = `Dismount-VHD -Path ${pathArg}`
  const pwshCommandArgs = ['-NoProfile', '-Command', `. {${pwshCommand}}`]

  const options: ExecOptions = {}
  options.failOnStdErr = false
  options.ignoreReturnCode = true

  return await exec(POWERSHELL_BIN, pwshCommandArgs, options)
}

export async function create(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
): Promise<string> {
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

  const pwshCommandArgs = ['-NoProfile', '-Command', `. {${pwshCommand}}`]

  return await execMountOrCreate(pwshCommandArgs)
}

export async function mount(drivePath: string): Promise<string> {
  const pathArg = quote([drivePath])

  const pwshCommand = [
    `$DevDrive = Mount-VHD -Path ${pathArg} -PassThru |`,
    'Get-Disk |',
    'Get-Partition |',
    'Get-Volume ;',
    `Write-Output ($DevDrive.DriveLetter + ':')`,
  ].join(' ')

  core.debug(`Generated the following command:\n${pwshCommand}`)

  const pwshCommandArgs = ['-NoProfile', '-Command', `. {${pwshCommand}}`]

  return await execMountOrCreate(pwshCommandArgs)
}

async function execMountOrCreate(pwshCommandArgs: string[]): Promise<string> {
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

  await exec(POWERSHELL_BIN, pwshCommandArgs, options)

  core.debug(`Command stdout:\n${outStr}`)
  core.debug(`Command stderr:\n${errStr}`)

  // Trim because Buffers tend to have newlines.
  const cleanedErr = errStr.trim()
  if (cleanedErr.length > 0) {
    core.error('Failed to create or mount Dev Drive...')
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