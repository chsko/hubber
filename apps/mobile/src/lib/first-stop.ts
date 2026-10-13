/** Where onboarding's last step ("What would you like to do first?") sends the person. */
export type FirstStop = "/hub/new" | "/hub/join" | "/discover";

let pending: FirstStop | null = null;

/** Remembered until the tabs are up, since onboarding's screen goes away when it completes. */
export function setFirstStop(stop: FirstStop | null): void {
  pending = stop;
}

export function takeFirstStop(): FirstStop | null {
  const stop = pending;
  pending = null;
  return stop;
}
