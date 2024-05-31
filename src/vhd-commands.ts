import { quote } from 'shell-quote'
import { exec, ExecOptions } from '@actions/exec'
import {
  DRIVE_LETTER_RE,
  NATIVE_DEV_DRIVE_WIN_VERSION,
  POWERSHELL_BIN,
} from './constants'
import os from 'node:os'
import { compare } from 'compare-versions'
import * as core from '@actions/core'
import fs from 'fs-extra'
import path from 'node:path'

const VHDCommandNotFound = (name: string) =>
  new Error(
    `Failed to detect ${name} command. Hyper-V may not be enabled or you're running an unsupported Windows version.`,
  )

// Basic helper to prevents shell-quote.quote default behavior of escaping `\` in windows.
const winQuote = (str: string) => quote([str]).replaceAll('\\\\', '\\')

export async function dismount(drivePath: string, mountPath: string) {
  const pathArg = winQuote(drivePath)
  const mountArg = winQuote(mountPath)

  // When running inside `-Command`, `-ErrorAction Stop` will retain the proper exit code
  const dismountDiskCmd = `Dismount-VHD -Path ${pathArg} -ErrorAction Stop`
  const dismountDiskCmdArgs = ['-NoProfile', '-Command', `. { ${dismountDiskCmd} }`]
  core.debug(`Generated the following command:\n${dismountDiskCmd}`)

  const dismountDiskCmdExists = await checkCommandExist('Dismount-VHD')
  if (dismountDiskCmdExists != 0) {
    throw VHDCommandNotFound('Dismount-VHD')
  }

  const removePartCmd = [
    `$ErrorActionPreference = 'Stop' ;`,
    // Get partitions for VHD
    `Get-VHD -Path ${pathArg} |`,
    'Get-Disk |',
    'Get-Partition |',
    // Filter out reserved partitions (if any)
    'where { ($_ | Get-Volume) -ne $Null } |',
    `Remove-PartitionAccessPath -AccessPath ${mountArg}`,
  ].join(' ')
  const removePartCmdArgs = ['-NoProfile', '-Command', `. { ${removePartCmd} }`]
  core.debug(`Generated the following command:\n${removePartCmd}`)

  const dismountPartCmdExists = await checkCommandExist('Get-VHD')
  if (dismountPartCmdExists != 0) {
    throw VHDCommandNotFound('Get-VHD')
  }

  const options: ExecOptions = {}
  let outStr = ''
  let errStr = ''
  options.silent = true
  options.failOnStdErr = false
  options.ignoreReturnCode = true
  options.listeners = {
    stdout: (data: Buffer) => {
      outStr += data.toString()
    },
    stderr: (data: Buffer) => {
      errStr += data.toString()
    },
  }

  // Assume mounted path of just two characters is a Drive Letter
  let retCode
  const isMountedFolder = !DRIVE_LETTER_RE.test(mountPath)
  if (isMountedFolder) {
    // Remove Partition First
    core.info(`Removing partition at '${mountPath}'.`)
    retCode = await exec(POWERSHELL_BIN, removePartCmdArgs, options)
    core.debug(`Command stdout:\n${outStr}`)
    core.debug(`Command stderr:\n${errStr}`)
    if (retCode != 0) {
      core.warning(
        `Removal of partition at '${mountPath}' failed with exit code ${retCode}.`,
      )
    }
    outStr = ''
    errStr = ''
  }

  // Dismount VHD Last
  core.info(`Dismounting disk at '${drivePath}'.`)
  retCode = await exec(POWERSHELL_BIN, dismountDiskCmdArgs, options)
  core.debug(`Command stdout:\n${outStr}`)
  core.debug(`Command stderr:\n${errStr}`)
  if (retCode != 0) {
    core.warning(`Dismounting disk at '${drivePath}' failed with exit code ${retCode}.`)
  }

  return retCode
}

export async function create(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
  mountPath: string,
): Promise<string> {
  const sizeArg = winQuote(driveSize)
  const formatArg = winQuote(driveFormat)
  const pathArg = winQuote(drivePath)
  const mountArg = winQuote(mountPath)

  const osVersion = os.release()
  const supportsDevDrive = compare(os.release(), NATIVE_DEV_DRIVE_WIN_VERSION, '>=')
  core.debug(`Windows Version ${osVersion}. Native Dev Drive? ${supportsDevDrive}`)

  let formatCmd = `Format-Volume -FileSystem ${formatArg} -Confirm:$false -Force`
  if (supportsDevDrive && formatArg === 'ReFS') {
    formatCmd = `Format-Volume -DevDrive -Confirm:$false -Force`
  }

  const commandExists = await checkCommandExist('New-VHD')
  if (commandExists != 0) {
    throw VHDCommandNotFound('New-VHD')
  }

  // Use drive letter mounting when there's no specified mount path
  let withDriveLetter = true
  try {
    await fs.access(mountPath, fs.constants.F_OK | fs.constants.W_OK)
    withDriveLetter = false
  } catch (e) {
    if (mountPath) {
      core.warning((e as NodeJS.ErrnoException).message)
      core.info(
        `Mount path '${mountPath}' is not writable, using Drive Letter instead.`,
      )
    }
  }

  const pwshCommand = [
    `$ErrorActionPreference = 'Stop' ;`,
    '$DevDrive =',
    // Create VHD
    `New-VHD -Path ${pathArg} -SizeBytes ${sizeArg} -${driveType} |`,
    // Mount VHD
    withDriveLetter ? 'Mount-VHD -PassThru |' : 'Mount-VHD -NoDriveLetter -PassThru |',
    // Init Disk
    'Initialize-Disk -PassThru |',
    // Init Partition
    withDriveLetter
      ? 'New-Partition -AssignDriveLetter -UseMaximumSize ;'
      : 'New-Partition -UseMaximumSize ;',
    // Format Partition
    `$DevDrive | ${formatCmd} | Out-Null;`,
    // Output Mount Path
    withDriveLetter
      ? `Write-Output ($DevDrive.DriveLetter + ':')`
      : `$DevDrive | Add-PartitionAccessPath -AccessPath ${mountArg} | Out-Null ; Write-Output ${mountArg}`,
  ].join(' ')

  core.debug(`Generated the following command:\n${pwshCommand}`)

  const pwshCommandArgs = ['-NoProfile', '-Command', `. { ${pwshCommand} }`]

  return await execMountOrCreate(pwshCommandArgs)
}

export async function mount(drivePath: string, mountPath: string): Promise<string> {
  const pathArg = winQuote(drivePath)
  const mountArg = winQuote(mountPath)

  const commandExists = await checkCommandExist('Mount-VHD')
  if (commandExists != 0) {
    throw VHDCommandNotFound('Mount-VHD')
  }

  // Use drive letter mounting when there's no specified mount path
  let withDriveLetter = true
  try {
    await fs.access(mountPath, fs.constants.F_OK | fs.constants.W_OK)
    withDriveLetter = false
  } catch (e) {
    if (mountPath) {
      core.warning((e as NodeJS.ErrnoException).message)
      core.info(
        `Mount path '${mountPath}' is not writable, using Drive Letter instead.`,
      )
    }
  }

  const pwshCommand = [
    `$ErrorActionPreference = 'Stop' ;`,
    '$DevDrive =',
    // Mount VHD
    withDriveLetter
      ? `Mount-VHD -Path ${pathArg} -PassThru |`
      : `Mount-VHD -Path ${pathArg} -NoDriveLetter -PassThru |`,
    'Get-Disk |',
    'Get-Partition |',
    // Filter out reserved partitions (if any)
    'where { ($_ | Get-Volume) -ne $Null } ;',
    // Get Mount Path
    withDriveLetter
      ? `$DevDrive = $DevDrive | Get-Volume ; Write-Output ($DevDrive.DriveLetter + ':')`
      : `$DevDrive | Add-PartitionAccessPath -AccessPath ${mountArg} | Out-Null ; Write-Output ${mountArg}`,
  ].join(' ')

  core.debug(`Generated the following command:\n${pwshCommand}`)

  const pwshCommandArgs = ['-NoProfile', '-Command', `. { ${pwshCommand} }`]

  return await execMountOrCreate(pwshCommandArgs)
}

async function execMountOrCreate(pwshCommandArgs: string[]): Promise<string> {
  const options: ExecOptions = {}
  let outStr = ''
  let errStr = ''
  options.silent = true
  options.failOnStdErr = false
  options.ignoreReturnCode = true
  options.listeners = {
    stdout: (data: Buffer) => {
      outStr += data.toString()
    },
    stderr: (data: Buffer) => {
      errStr += data.toString()
    },
  }

  const ret = await exec(POWERSHELL_BIN, pwshCommandArgs, options)

  core.debug(`Command stdout:\n${outStr}`)
  core.debug(`Command stderr:\n${errStr}`)

  // Trim because Buffers tend to have newlines.
  const cleanedErr = errStr.trim()
  if (cleanedErr.length > 0 || ret !== 0) {
    core.error(`Failed to setup Dev Drive with exit code ${ret}.`)
    throw new Error(cleanedErr)
  }

  // Trim because Buffers tend to have newlines.
  let mountedPath = outStr.trim()

  // Assume mounted path of just two characters is a Drive Letter
  if (!DRIVE_LETTER_RE.test(mountedPath)) {
    mountedPath = path.resolve(mountedPath)
  }

  // Do a basic check on the Dev Drive
  // If it fails, this will raise an error and the generic handler will take care of it.
  await fs.access(mountedPath, fs.constants.F_OK | fs.constants.W_OK)

  return mountedPath
}

async function checkCommandExist(name: string): Promise<number> {
  // When running inside `-Command`, `-ErrorAction Stop` will retain the proper exit code
  const pwshCommand = `Get-Command -Name ${name} -CommandType Cmdlet -ErrorAction Stop`
  const pwshCommandArgs = ['-NoProfile', '-Command', `. { ${pwshCommand} }`]

  const options: ExecOptions = {}
  options.silent = true
  options.failOnStdErr = false
  options.ignoreReturnCode = true

  return await exec(POWERSHELL_BIN, pwshCommandArgs, options)
}
