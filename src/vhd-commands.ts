import { quote } from 'shell-quote'
import { exec, ExecOptions } from '@actions/exec'
import {
  Cmdlets,
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

class PowerShellCommandExecutor {
  private readonly command: string
  private readonly args: string[] = []
  private options: ExecOptions = {
    silent: true,
    failOnStdErr: false,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        this.outStr += data.toString()
      },
      stderr: (data: Buffer) => {
        this.errStr += data.toString()
      },
    },
  }
  private outStr: string = ''
  private errStr: string = ''

  constructor(commands: string[]) {
    this.command = commands.join(' ')
    this.args = ['-NoProfile', '-Command', `. { ${this.command} }`]
  }

  public setOptions(customOptions: Partial<ExecOptions>): PowerShellCommandExecutor {
    this.options = { ...this.options, ...customOptions }
    return this
  }

  public getStdOut(): string {
    // Trim because Buffers tend to have newlines.
    return this.outStr.trim()
  }

  public getStdErr(): string {
    // Trim because Buffers tend to have newlines.
    return this.errStr.trim()
  }

  public async execute(): Promise<number> {
    core.debug(`Executing the following command:\n${this.command}`)
    const cmdStatus = await exec(POWERSHELL_BIN, this.args, this.options)
    core.debug(`Command finished with exit code ${cmdStatus}.`)
    core.debug(`Command stdout:\n${this.getStdOut()}`)
    core.debug(`Command stderr:\n${this.getStdErr()}`)
    return cmdStatus
  }
}

export async function dismount(drivePath: string, mountPath: string) {
  const pathArg = winQuote(drivePath)
  const mountArg = winQuote(mountPath)

  // When running inside `-Command`, `-ErrorAction Stop` will retain the proper exit code
  const dismountDiskArgs = [`Dismount-VHD -Path ${pathArg} -ErrorAction Stop`]
  const dismountDiskExecutor = new PowerShellCommandExecutor(dismountDiskArgs)

  const dismountDiskCmdExists = await execCommandExists(Cmdlets.DismountVHD)
  if (dismountDiskCmdExists != 0) {
    throw VHDCommandNotFound(Cmdlets.DismountVHD)
  }

  const removePartArgs = [
    `$ErrorActionPreference = 'Stop' ;`,
    // Get partitions for VHD
    `Get-VHD -Path ${pathArg} |`,
    'Get-Disk |',
    'Get-Partition |',
    // Filter out reserved partitions (if any)
    'where { ($_ | Get-Volume) -ne $Null } |',
    `Remove-PartitionAccessPath -AccessPath ${mountArg}`,
  ]
  const removePartExecutor = new PowerShellCommandExecutor(removePartArgs)

  const dismountPartCmdExists = await execCommandExists(Cmdlets.GetVHD)
  if (dismountPartCmdExists != 0) {
    throw VHDCommandNotFound(Cmdlets.GetVHD)
  }

  // Assume mounted path of just two characters is a Drive Letter
  let cmdStatus
  const isMountedFolder = !DRIVE_LETTER_RE.test(mountPath)
  if (isMountedFolder) {
    // Remove Partition First
    core.info(`Removing partition at '${mountPath}'.`)
    cmdStatus = await removePartExecutor.execute()
    if (cmdStatus != 0) {
      core.warning(
        `Removal of partition at '${mountPath}' failed with exit code ${cmdStatus}.`,
      )
    }
  }

  // Dismount VHD Last
  core.info(`Dismounting disk at '${drivePath}'.`)
  cmdStatus = await dismountDiskExecutor.execute()
  if (cmdStatus != 0) {
    core.warning(
      `Dismounting disk at '${drivePath}' failed with exit code ${cmdStatus}.`,
    )
  }

  return cmdStatus
}

export async function create(
  driveSize: string,
  driveFormat: string,
  drivePath: string,
  driveType: string,
  mountPath: string,
  nativeDevDrive: boolean,
  trustedDevDrive: boolean,
): Promise<string> {
  const sizeArg = winQuote(driveSize)
  const formatArg = winQuote(driveFormat)
  const pathArg = winQuote(drivePath)
  const mountArg = winQuote(mountPath)

  const osVersion = os.release()
  const supportsDevDrive = compare(os.release(), NATIVE_DEV_DRIVE_WIN_VERSION, '>=')
  core.debug(`Windows Version ${osVersion}. Native Dev Drive? ${supportsDevDrive}`)

  let markAsTrusted = false
  let formatCmd = `Format-Volume -FileSystem ${formatArg} -Confirm:$false -Force`
  if (nativeDevDrive && supportsDevDrive && formatArg === 'ReFS') {
    formatCmd = `Format-Volume -DevDrive -Confirm:$false -Force`
    // trust mode is compatible with native dev drives only
    markAsTrusted = trustedDevDrive
  }

  const commandExists = await execCommandExists(Cmdlets.NewVHD)
  if (commandExists != 0) {
    throw VHDCommandNotFound(Cmdlets.NewVHD)
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

  const createDevDriveArgs = [
    `$ErrorActionPreference = 'Stop' ;`,
    '$DevDrive =',
    // Create VHD
    `New-VHD -Path ${pathArg} -SizeBytes ${sizeArg} -${driveType} |`,
    // Mount VHD
    withDriveLetter ? 'Mount-VHD -PassThru |' : 'Mount-VHD -NoDriveLetter -PassThru |',
    // Init Disk
    'Initialize-Disk -PassThru |',
    // Init Partitions
    withDriveLetter
      ? 'New-Partition -AssignDriveLetter -UseMaximumSize ;'
      : 'New-Partition -UseMaximumSize ;',
    // Format Partition
    `$DevDrive | ${formatCmd} | Out-Null;`,
    // Output Mount Path
    withDriveLetter
      ? `Write-Output ($DevDrive.DriveLetter + ':')`
      : `$DevDrive | Add-PartitionAccessPath -AccessPath ${mountArg} | Out-Null ; Write-Output ${mountArg}`,
  ]

  if (markAsTrusted) {
    core.info('Disabling AV filters for dev drives.')
    await execDisableAVFilter()
  }

  const mountedPath = await execMountOrCreate(createDevDriveArgs)

  if (markAsTrusted) {
    core.info(`Marking dev drive at ${mountPath} as trusted.`)
    await execMarkAsTrusted(mountedPath)
  }

  return mountedPath
}

export async function mount(drivePath: string, mountPath: string): Promise<string> {
  const pathArg = winQuote(drivePath)
  const mountArg = winQuote(mountPath)

  const commandExists = await execCommandExists(Cmdlets.MountVHD)
  if (commandExists != 0) {
    throw VHDCommandNotFound(Cmdlets.MountVHD)
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

  const mountCmdArgs = [
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
  ]

  return await execMountOrCreate(mountCmdArgs)
}

async function execMountOrCreate(pwshCommandArgs: string[]): Promise<string> {
  const commandExecutor = new PowerShellCommandExecutor(pwshCommandArgs)
  const cmdStatus = await commandExecutor.execute()

  const cleanedErr = commandExecutor.getStdErr()
  if (cleanedErr.length > 0 || cmdStatus !== 0) {
    core.error(`Failed to setup Dev Drive with exit code ${cmdStatus}.`)
    throw new Error(cleanedErr)
  }

  // Assume mounted path of just two characters is a Drive Letter
  let mountedPath = commandExecutor.getStdOut()
  if (!DRIVE_LETTER_RE.test(mountedPath)) {
    mountedPath = path.resolve(mountedPath)
  }

  // Do a basic check on the Dev Drive
  // If it fails, this will raise an error and the generic handler will take care of it.
  await fs.access(mountedPath, fs.constants.F_OK | fs.constants.W_OK)

  return mountedPath
}

async function execCommandExists(name: string): Promise<number> {
  // When running inside `-Command`, `-ErrorAction Stop` will retain the proper exit code
  const checkCommandArgs = [
    `Get-Command -Name ${name} -CommandType Cmdlet -ErrorAction Stop`,
  ]
  const checkCommandExecutor = new PowerShellCommandExecutor(checkCommandArgs)
  return await checkCommandExecutor.execute()
}

async function execDisableAVFilter(): Promise<number> {
  const disableAVFilterArgs = [
    `$ErrorActionPreference = 'Stop' ;`,
    // Disable AV on dev drive
    // See https://learn.microsoft.com/en-us/windows/dev-drive/#how-do-i-configure-additional-filters-on-dev-drive
    'fsutil devdrv enable /disallowAv ;',
    // Shows enablement logs
    'fsutil devdrv query',
  ]
  const disableAVFilterExecutor = new PowerShellCommandExecutor(disableAVFilterArgs)
  return await disableAVFilterExecutor.execute()
}

async function execMarkAsTrusted(mountPath: string): Promise<number> {
  // Note: This function assumes mountPath is escaped already.
  const markAsTrustedArgs = [
    `$ErrorActionPreference = 'Stop' ;`,
    // Mark dev drive as trusted
    // See https://learn.microsoft.com/en-us/windows/dev-drive/#how-do-i-designate-a-dev-drive-as-trusted
    `fsutil devdrv clearFiltersAllowed ${mountPath} ;`,
    `fsutil devdrv trust /f ${mountPath} ;`,
    // Shows enablement logs
    `fsutil devdrv query ${mountPath}`,
  ]
  const markAsTrustedExecutor = new PowerShellCommandExecutor(markAsTrustedArgs)
  return await markAsTrustedExecutor.execute()
}
