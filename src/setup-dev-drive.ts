import * as core from '@actions/core'
import { setup } from './setup-impl'
import { ExternalInputs } from './constants'

async function main() {
  const driveSize = core.getInput(ExternalInputs.DriveSize)
  const driveFormat = core.getInput(ExternalInputs.DriveFormat)
  const drivePath = core.getInput(ExternalInputs.DrivePath)
  const driveType = core.getInput(ExternalInputs.DriveType)
  const mountPath = core.getInput(ExternalInputs.MountPath)
  const mountIfExists = core.getBooleanInput(ExternalInputs.MountIfExists)
  const copyWorkspace = core.getBooleanInput(ExternalInputs.WorkspaceCopy)
  const nativeDevDrive = core.getBooleanInput(ExternalInputs.NativeDevDrive)
  const trustedDevDrive = core.getBooleanInput(ExternalInputs.TrustedDevDrive)
  const envMapping = core.getMultilineInput(ExternalInputs.EnvMapping)
  await setup(
    driveSize,
    driveFormat,
    drivePath,
    driveType,
    mountPath,
    mountIfExists,
    copyWorkspace,
    nativeDevDrive,
    trustedDevDrive,
    envMapping,
  )
}

main().catch(err => core.setFailed(err.message))
