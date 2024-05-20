import * as core from '@actions/core'
import { StateVariables, WIN_PLATFORM } from './constants'
import { dismount } from './vhd-commands'

export async function cleanup(): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    core.info('This action can only run on Windows.')
    return
  }

  core.info('Attempting to remove Dev Drive...')

  const drivePath = core.getState(StateVariables.DevDrivePath)
  core.debug(`Retrieved State ${StateVariables.DevDrivePath}=${drivePath}`)

  const ret = await dismount(drivePath)
  core.info(`Removal completed with exit code ${ret}...`)
}
