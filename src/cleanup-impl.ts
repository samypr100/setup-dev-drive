import * as core from '@actions/core'
import { StateVariables, WIN_PLATFORM } from './constants'
import { dismount } from './vhd-commands'

export async function cleanup(): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    throw new Error('This action can only run on windows.')
  }

  core.info('Attempting to remove Dev Drive...')

  const drivePath = core.getState(StateVariables.DevDrivePath)
  core.debug(`Retrieved State ${StateVariables.DevDrivePath}=${drivePath}`)

  const ret = await dismount(drivePath)
  core.info(`Removal completed with exit code ${ret}...`)
}
