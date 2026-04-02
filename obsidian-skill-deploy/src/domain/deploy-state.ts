export function hasConflict(remoteTreeSha: string, lastDeployTreeSha: string): boolean {
	return remoteTreeSha !== lastDeployTreeSha;
}

export function isFirstDeploy(lastDeployTreeSha: string | undefined | null): boolean {
	return !lastDeployTreeSha || lastDeployTreeSha === '';
}
