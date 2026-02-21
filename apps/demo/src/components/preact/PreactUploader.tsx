/** @jsxImportSource preact */

import { useCSVImporter } from "@elekcsv/preact";
import type { ImportResult } from "@elekcsv/preact";
import type { JSX } from "preact";
import { useCallback, useRef, useState } from "preact/hooks";

export default function PreactUploader() {
	const [dragActive, setDragActive] = useState(false);
	const [parsingTime, setParsingTime] = useState<number | null>(null);
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const reloadInputRef = useRef<HTMLInputElement>(null);

	const { state, loadFile, isLoading } = useCSVImporter({
		schema: {
			columns: {
				id: { type: "number" },
				first_name: { type: "string" },
				last_name: { type: "string" },
				email: { type: "string", rules: [{ rule: "required" }] },
				age: { type: "number" },
				city: { type: "string" },
				signup_date: { type: "date" },
				is_active: { type: "boolean" },
			},
		},
		onComplete: (result: ImportResult) => {
			setParsingTime(result.stats.parseTime + result.stats.validationTime);
		},
	});

	const handleDrag = useCallback((e: JSX.TargetedDragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") {
			setDragActive(true);
		} else if (e.type === "dragleave") {
			setDragActive(false);
		}
	}, []);

	const handleDrop = useCallback(
		(e: JSX.TargetedDragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setDragActive(false);

			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				loadFile(e.dataTransfer.files[0]);
			}
		},
		[loadFile]
	);

	const handleChange = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
		const target = e.currentTarget;
		if (target.files && target.files.length > 0) {
			loadFile(target.files[0]);
			target.value = "";
		}
	};

	const handleButtonClick = () => {
		if (reloadInputRef.current) {
			reloadInputRef.current.value = "";
			reloadInputRef.current.click();
		}
	};

	const hasData = state.mappedData && state.mappedData.length > 0;
	const errorCount = state.validation?.stats?.errorRows || 0;

	return (
		<div className="w-full font-sans h-[520px]">
			{!hasData ? (
				<div
					className={`relative border-2 border-dashed p-12 text-center transition-all duration-200! cursor-pointer flex flex-col items-center justify-center h-full w-full
            ${dragActive ? "border-black bg-neutral-100 scale-[0.99]" : "border-neutral-300 bg-white hover:border-black hover:bg-neutral-50"}
          `}
					onDragEnter={handleDrag}
					onDragLeave={handleDrag}
					onDragOver={handleDrag}
					onDrop={handleDrop}
				>
					<input
						id="preact-uploader-input"
						ref={uploadInputRef}
						type="file"
						accept=".csv"
						onChange={handleChange}
						className="hidden"
					/>
					{isLoading ? (
						<div className="text-black font-medium tracking-tight animate-pulse flex flex-col items-center">
							<svg
								className="w-8 h-8 mb-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Processing <strong>sample.csv</strong>...
						</div>
					) : (
						<>
							<div
								className={`p-4 rounded-full mb-4 transition-colors ${dragActive ? "bg-black text-white" : "bg-neutral-100 text-black"}`}
							>
								<svg
									className="w-8 h-8"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
									/>
								</svg>
							</div>
							<h3 className="text-black font-semibold text-xl mb-2 mt-0 tracking-tight">
								Upload your CSV
							</h3>
							<p className="text-neutral-500 text-sm max-w-sm mx-auto mb-8 leading-relaxed">
								Drag and drop your file here or click the button below to browse your computer.
							</p>
							<label
								htmlFor="preact-uploader-input"
								className="px-6 py-3 bg-black text-white text-sm font-semibold uppercase tracking-wider hover:bg-neutral-800 transition-colors"
							>
								Select File
							</label>
						</>
					)}
				</div>
			) : (
				<div className="border-2 border-black bg-white relative flex flex-col h-full w-full">
					<div className="absolute -top-3 left-6 bg-white px-2 text-sm font-bold uppercase tracking-widest text-black">
						Output Context
					</div>

					<div className="flex items-end justify-start p-6 pb-4 gap-4">
						<div className="flex gap-4 text-xs font-mono text-neutral-800 h-10">
							<span className="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
								<strong className="text-black font-bold">Rows:</strong> {state.mappedData?.length}
							</span>
							<span className="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
								<strong className="text-black font-bold">Errors:</strong> {errorCount}
							</span>
							{parsingTime !== null && (
								<span className="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
									<strong className="text-black font-bold">Time:</strong> {parsingTime}ms
								</span>
							)}
						</div>

						<div className="h-10">
							<input
								ref={reloadInputRef}
								type="file"
								accept=".csv"
								onChange={handleChange}
								className="hidden"
							/>
							<button
								onClick={handleButtonClick}
								type="button"
								className="h-full text-xs font-bold uppercase tracking-widest border-2 border-black px-4 hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
							>
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
									/>
								</svg>
								Load New File
							</button>
						</div>
					</div>

					<div className="p-0 flex-1 border-t border-neutral-200 overflow-hidden">
						<pre className="m-0! p-6! bg-[#fafafa]! rounded-none! text-xs h-full w-full overflow-auto border-0!">
							<code>
								{JSON.stringify(
									{
										data: state.mappedData
											?.slice(0, 3)
											.concat(state.mappedData.length > 3 ? [["... (truncated)"]] : []),
										errors: state.validation?.errors?.slice(0, 5),
									},
									null,
									2
								)}
							</code>
						</pre>
					</div>
				</div>
			)}
		</div>
	);
}
