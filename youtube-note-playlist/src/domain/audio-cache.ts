import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const YTDLP_PATH = '/opt/homebrew/bin/yt-dlp';

export class AudioCacheService {
	private cacheDir: string;

	constructor(basePath: string) {
		this.cacheDir = join(basePath, '.obsidian', 'plugins', 'youtube-note-playlist', 'audio-cache');
		if (!existsSync(this.cacheDir)) {
			mkdirSync(this.cacheDir, { recursive: true });
		}
	}

	hasCached(videoId: string): boolean {
		return existsSync(this.getFilePath(videoId));
	}

	getFileUrl(videoId: string): string {
		const buffer = readFileSync(this.getFilePath(videoId));
		const blob = new Blob([buffer], { type: 'audio/mpeg' });
		return URL.createObjectURL(blob);
	}

	private getFilePath(videoId: string): string {
		return join(this.cacheDir, `${videoId}.mp3`);
	}

	async download(videoId: string, onProgress: (percent: number) => void): Promise<string> {
		const output = this.getFilePath(videoId);
		if (existsSync(output)) return output;

		this.cleanIntermediate(videoId);

		return new Promise((resolve, reject) => {
			let stderrOutput = '';
			const proc = spawn(YTDLP_PATH, [
				'-x', '--audio-format', 'mp3', '--audio-quality', '0',
				'--no-playlist',
				'-o', join(this.cacheDir, `${videoId}.%(ext)s`),
				`https://www.youtube.com/watch?v=${videoId}`,
			]);

			proc.stderr.on('data', (data: Buffer) => {
				const line = data.toString();
				stderrOutput += line;
				const match = line.match(/\[download\]\s+([\d.]+)%/);
				if (match) {
					onProgress(parseFloat(match[1]));
				}
			});

			proc.stdout.on('data', (data: Buffer) => {
				stderrOutput += data.toString();
			});

			proc.on('close', (code) => {
				if (code === 0 && existsSync(output)) {
					this.cleanIntermediate(videoId);
					resolve(output);
				} else {
					reject(new Error(`yt-dlp exited with code ${code}: ${stderrOutput.slice(-200)}`));
				}
			});

			proc.on('error', (err) => reject(err));
		});
	}

	private cleanIntermediate(videoId: string): void {
		for (const file of readdirSync(this.cacheDir)) {
			if (file.startsWith(videoId) && !file.endsWith('.wav')) {
				unlinkSync(join(this.cacheDir, file));
			}
		}
	}

	static isAvailable(): boolean {
		const result = spawnSync(YTDLP_PATH, ['--version'], { stdio: 'ignore' });
		return result.status === 0;
	}
}
