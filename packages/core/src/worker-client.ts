import type { Schema } from "./types";
import type { WorkerMessage, WorkerResponse } from "./worker";

export interface WorkerClientOptions {
	worker?: Worker;
	workerUrl?: string;
}

export interface ParseResult {
	headers: string[];
	data: string[][];
	rowCount: number;
}

export interface ValidateResult {
	valid: boolean;
	stats: {
		totalRows: number;
		validRows: number;
		errorRows: number;
		errorsByRule: Record<string, number>;
		errorsByColumn: Record<string, number>;
	};
	errors: Array<{
		row: number;
		col: number;
		field: string;
		value: string;
		code: number;
		message?: string;
	}>;
	aborted: boolean;
}

export interface ParseAndValidateResult extends ParseResult {
	validation: ValidateResult;
}

let idCounter = 0;

export class CSVWorkerClient {
	private worker: Worker | null = null;
	private pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason: Error) => void;
		}
	>();
	private disposed = false;

	constructor(options: WorkerClientOptions = {}) {
		if (options.worker) {
			this.worker = options.worker;
			this.setupListener();
		} else if (options.workerUrl) {
			this.worker = new Worker(options.workerUrl);
			this.setupListener();
		}
	}

	private setupListener() {
		if (!this.worker) return;

		this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const { id, type, result, error } = e.data;
			const pending = this.pending.get(id);
			if (!pending) return;

			this.pending.delete(id);

			if (type === "error") {
				pending.reject(new Error(error ?? "Unknown error"));
			} else {
				pending.resolve(result);
			}
		};

		this.worker.onerror = (e) => {
			for (const { reject } of this.pending.values()) {
				reject(new Error(e.message));
			}
			this.pending.clear();
		};
	}

	private async sendMessage<T>(type: WorkerMessage["type"], payload: unknown): Promise<T> {
		if (this.disposed) {
			throw new Error("WorkerClient has been disposed");
		}

		if (!this.worker) {
			throw new Error("No worker available");
		}

		const id = `msg_${++idCounter}`;

		return new Promise((resolve, reject) => {
			const worker = this.worker;
			if (!worker) {
				reject(new Error("No worker available"));
				return;
			}

			this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
			worker.postMessage({ id, type, payload });

			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					reject(new Error("Worker request timed out"));
				}
			}, 60000);
		});
	}

	async parse(
		content: string,
		options?: {
			delimiter?: string;
			quote?: string;
			header?: boolean;
			skipEmptyLines?: boolean;
			maxRows?: number;
		}
	): Promise<ParseResult> {
		return this.sendMessage<ParseResult>("parse", { content, ...options });
	}

	async validate(data: string[][], schema: Schema): Promise<ValidateResult> {
		return this.sendMessage<ValidateResult>("validate", { data, schema });
	}

	async parseAndValidate(
		content: string,
		schema: Schema,
		options?: {
			delimiter?: string;
			quote?: string;
			header?: boolean;
			skipEmptyLines?: boolean;
			maxRows?: number;
		}
	): Promise<ParseAndValidateResult> {
		return this.sendMessage<ParseAndValidateResult>("parseAndValidate", {
			content,
			schema,
			...options,
		});
	}

	terminate(): void {
		this.disposed = true;
		for (const { reject } of this.pending.values()) {
			reject(new Error("WorkerClient terminated"));
		}
		this.pending.clear();
		this.worker?.terminate();
		this.worker = null;
	}
}

export function createWorkerClient(options?: WorkerClientOptions): CSVWorkerClient {
	return new CSVWorkerClient(options);
}
