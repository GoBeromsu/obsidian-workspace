import type { CanonicalFrontmatter } from '../types/skill';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(content: string): { frontmatter: CanonicalFrontmatter; body: string } {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		throw new Error('No YAML frontmatter found');
	}

	const yamlBlock = match[1] ?? '';
	const body = match[2] ?? '';
	const frontmatter = parseYamlSimple(yamlBlock);

	if (!frontmatter['name'] || typeof frontmatter['name'] !== 'string') {
		throw new Error('Frontmatter missing required field: name');
	}
	if (!frontmatter['description'] || typeof frontmatter['description'] !== 'string') {
		throw new Error('Frontmatter missing required field: description');
	}

	return { frontmatter: frontmatter as CanonicalFrontmatter, body };
}

export function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
	const yaml = serializeYamlSimple(frontmatter);
	const separator = body.startsWith('\n') ? '' : '\n';
	return `---\n${yaml}\n---${separator}${body}`;
}

function parseYamlSimple(yaml: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = yaml.split('\n');

	let currentKey: string | null = null;
	let arrayValues: string[] | null = null;

	for (const line of lines) {
		// Array item continuation
		if (arrayValues !== null && /^\s+-\s+/.test(line)) {
			const value = line.replace(/^\s+-\s+/, '').trim();
			arrayValues.push(unquote(value));
			continue;
		}

		// Flush previous array
		if (arrayValues !== null && currentKey !== null) {
			result[currentKey] = arrayValues;
			arrayValues = null;
			currentKey = null;
		}

		// Skip empty lines
		if (line.trim() === '') continue;

		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		const rawValue = line.slice(colonIdx + 1).trim();

		if (rawValue === '') {
			// Could be start of an array or nested object
			currentKey = key;
			arrayValues = [];
			continue;
		}

		// Inline array: [a, b, c]
		if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			const inner = rawValue.slice(1, -1);
			result[key] = inner.split(',').map(v => unquote(v.trim())).filter(v => v !== '');
			continue;
		}

		result[key] = parseValue(rawValue);
	}

	// Flush trailing array
	if (arrayValues !== null && currentKey !== null) {
		result[currentKey] = arrayValues;
	}

	return result;
}

function parseValue(raw: string): unknown {
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (raw === 'null') return null;
	if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
	if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
	return unquote(raw);
}

function unquote(s: string): string {
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1);
	}
	return s;
}

function serializeYamlSimple(obj: Record<string, unknown>): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined) continue;

		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${key}: []`);
			} else {
				lines.push(`${key}:`);
				for (const item of value) {
					lines.push(`  - ${serializeValue(item)}`);
				}
			}
		} else if (typeof value === 'object' && value !== null) {
			lines.push(`${key}:`);
			for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
				if (subValue !== undefined) {
					lines.push(`  ${subKey}: ${serializeValue(subValue)}`);
				}
			}
		} else {
			lines.push(`${key}: ${serializeValue(value)}`);
		}
	}

	return lines.join('\n');
}

function serializeValue(value: unknown): string {
	if (value === null) return 'null';
	if (typeof value === 'boolean') return String(value);
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') {
		if (value.includes(':') || value.includes('#') || value.includes('"') || value.includes("'")) {
			return `"${value.replace(/"/g, '\\"')}"`;
		}
		return value;
	}
	return JSON.stringify(value);
}
