const videoCallPathPattern =
  /^\/(?:fan|influencer)\/fan-meetings\/[^/]+\/call\/?$/

export function isVideoCallPath(pathname: string) {
  return videoCallPathPattern.test(pathname)
}
