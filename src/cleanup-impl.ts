import * as core from '@actions/core'
import { StateVariables, WIN_PLATFORM } from './constants'
import { dismount } from './vhd-commands'

export async function cleanup(): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    core.info('This action can only run on Windows.')
    return
  }

  core.info('Attempting to remove Dev Drive.')

  const mountedPath = core.getState(StateVariables.DevDrive)
  core.debug(`Retrieved State ${StateVariables.DevDrive}=${mountedPath}`)

  const drivePath = core.getState(StateVariables.DevDrivePath)
  core.debug(`Retrieved State ${StateVariables.DevDrivePath}=${drivePath}`)

  const ret = await dismount(drivePath, mountedPath)
  core.info(`Removal finished with exit code ${ret}.`)
}
