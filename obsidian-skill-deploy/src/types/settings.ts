import type { ProviderConfig } from './provider';

export interface SkillDeploySettings {
	skillsRootPath: string;
	providers: ProviderConfig[];
	githubAppClientId: string;
	deployStates: Record<string, DeployStateEntry>;
	plugin_notices?: { muted: Record<string, boolean> };
}

export interface StoredTokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	username: string;
}

export interface DeployStateEntry {
	lastDeployTreeSha: string;
	lastDeployedAt: string;
	commitSha: string;
}
