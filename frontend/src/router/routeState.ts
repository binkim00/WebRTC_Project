const videoCallPathPattern =
  /^\/(?:fan|influencer)\/fan-meetings\/[^/]+\/(?:call|calls\/[^/]+)\/?$/

export function isVideoCallPath(pathname: string) {
  return videoCallPathPattern.test(pathname)
}
