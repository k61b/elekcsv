// ============================================================================
// ErrorBitmap - Compact error tracking using bit arrays
// ============================================================================

/**
 * Compact bitmap for tracking cell-level validation errors.
 * Uses 1 bit per cell: 0 = valid, 1 = error.
 *
 * Memory usage: rows × cols / 8 bytes
 * For 100K rows × 8 cols = 100KB
 */
export class ErrorBitmap {
	private readonly bits: Uint32Array;
	readonly rows: number;
	readonly cols: number;

	constructor(rows: number, cols: number) {
		this.rows = rows;
		this.cols = cols;
		const totalBits = rows * cols;
		this.bits = new Uint32Array(Math.ceil(totalBits / 32));
	}

	/**
	 * Mark a cell as having an error.
	 */
	setError(row: number, col: number): void {
		const index = row * this.cols + col;
		this.bits[index >>> 5] |= 1 << (index & 31);
	}

	/**
	 * Check if a cell has an error.
	 */
	hasError(row: number, col: number): boolean {
		const index = row * this.cols + col;
		return (this.bits[index >>> 5] & (1 << (index & 31))) !== 0;
	}

	/**
	 * Check if a row has any error.
	 * Useful for row-level highlighting in UI.
	 */
	hasRowError(row: number): boolean {
		const start = row * this.cols;
		const end = start + this.cols;

		// Check each bit in the row
		for (let i = start; i < end; i++) {
			if (this.bits[i >>> 5] & (1 << (i & 31))) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Count total number of errors using Brian Kernighan's popcount.
	 */
	countErrors(): number {
		let count = 0;
		for (let i = 0; i < this.bits.length; i++) {
			let v = this.bits[i];
			while (v) {
				v &= v - 1;
				count++;
			}
		}
		return count;
	}

	/**
	 * Count number of rows that have at least one error.
	 */
	countErrorRows(): number {
		let count = 0;
		for (let row = 0; row < this.rows; row++) {
			if (this.hasRowError(row)) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Get all row indices that have errors in a specific column.
	 */
	getColumnErrors(col: number): number[] {
		const rows: number[] = [];
		for (let row = 0; row < this.rows; row++) {
			if (this.hasError(row, col)) {
				rows.push(row);
			}
		}
		return rows;
	}

	/**
	 * Get all column indices that have errors in a specific row.
	 */
	getRowErrorColumns(row: number): number[] {
		const cols: number[] = [];
		for (let col = 0; col < this.cols; col++) {
			if (this.hasError(row, col)) {
				cols.push(col);
			}
		}
		return cols;
	}

	/**
	 * Iterate over all errors, calling the callback for each.
	 * More efficient than building an array for large datasets.
	 */
	forEachError(callback: (row: number, col: number) => void): void {
		for (let i = 0; i < this.bits.length; i++) {
			let v = this.bits[i];
			if (v === 0) continue;

			const baseIndex = i * 32;
			let bit = 0;
			while (v) {
				if (v & 1) {
					const index = baseIndex + bit;
					if (index < this.rows * this.cols) {
						const row = Math.floor(index / this.cols);
						const col = index % this.cols;
						callback(row, col);
					}
				}
				v >>>= 1;
				bit++;
			}
		}
	}

	/**
	 * Get memory usage in bytes.
	 */
	get byteSize(): number {
		return this.bits.byteLength;
	}

	/**
	 * Clear all errors.
	 */
	clear(): void {
		this.bits.fill(0);
	}
}

// ============================================================================
// ErrorCodeMap - Stores error codes for each cell
// ============================================================================

/**
 * Stores the error code for each cell.
 * Uses Uint8Array for compact storage (max 255 error codes per column).
 *
 * Memory usage: rows × cols bytes
 * For 100K rows × 8 cols = 800KB
 */
export class ErrorCodeMap {
	private readonly codes: Uint8Array;
	readonly rows: number;
	readonly cols: number;

	constructor(rows: number, cols: number) {
		this.rows = rows;
		this.cols = cols;
		this.codes = new Uint8Array(rows * cols);
	}

	/**
	 * Set the error code for a cell.
	 */
	setCode(row: number, col: number, code: number): void {
		this.codes[row * this.cols + col] = code;
	}

	/**
	 * Get the error code for a cell.
	 * Returns 0 if no error.
	 */
	getCode(row: number, col: number): number {
		return this.codes[row * this.cols + col];
	}

	/**
	 * Get memory usage in bytes.
	 */
	get byteSize(): number {
		return this.codes.byteLength;
	}

	/**
	 * Clear all codes.
	 */
	clear(): void {
		this.codes.fill(0);
	}
}
