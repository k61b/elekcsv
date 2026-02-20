/// <reference lib="webworker" />

import { parse, validate } from "./index";
import type { Schema } from "./types";

export interface WorkerMessage {
	id: string;
	type: "parse" | "validate" | "parseAndValidate";
	payload: unknown;
}

export interface ParsePayload {
	content: string;
	delimiter?: string;
	quote?: string;
	header?: boolean;
	skipEmptyLines?: boolean;
	maxRows?: number;
}

export interface ValidatePayload {
	data: string[][];
	schema: Schema;
}

export interface WorkerResponse {
	id: string;
	type: "result" | "error";
	result?: unknown;
	error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const { id, type, payload } = e.data;

	try {
		let result: unknown;

		if (type === "parse") {
			const p = payload as ParsePayload;
			const parseResult = parse(p.content, {
				delimiter: p.delimiter,
				quote: p.quote,
				header: p.header ?? true,
				skipEmptyLines: p.skipEmptyLines,
			});

			let data = parseResult.rows;
			if (p.maxRows && data.length > p.maxRows) {
				data = data.slice(0, p.maxRows);
			}

			result = {
				headers: parseResult.headers,
				data,
				rowCount: data.length,
			};
		} else if (type === "validate") {
			const p = payload as ValidatePayload;
			result = validate(p.data, p.schema);
		} else if (type === "parseAndValidate") {
			const p = payload as ParsePayload & { schema: Schema };

			const parseResult = parse(p.content, {
				delimiter: p.delimiter,
				quote: p.quote,
				header: p.header ?? true,
				skipEmptyLines: p.skipEmptyLines,
			});

			let data = parseResult.rows;
			if (p.maxRows && data.length > p.maxRows) {
				data = data.slice(0, p.maxRows);
			}

			const validationResult = validate(data, p.schema);

			result = {
				headers: parseResult.headers,
				data,
				rowCount: data.length,
				validation: validationResult,
			};
		}

		const response: WorkerResponse = { id, type: "result", result };
		self.postMessage(response);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : "Unknown error";
		const response: WorkerResponse = { id, type: "error", error: errorMessage };
		self.postMessage(response);
	}
};
