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
  await setup(
    driveSize,
    driveFormat,
    drivePath,
    driveType,
    mountPath,
    mountIfExists,
    copyWorkspace,
  )
}

main().catch(err => core.setFailed(err.message))
