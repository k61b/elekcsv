/** @jsxImportSource solid-js */

import { useCSVImporter } from "@elekcsv/solid";
import type { ImportResult } from "@elekcsv/solid";
import { createSignal } from "solid-js";

export default function SolidUploader() {
	const [dragActive, setDragActive] = createSignal(false);
	const [parsingTime, setParsingTime] = createSignal<number | null>(null);
	let uploadInputRef: HTMLInputElement | undefined;
	let reloadInputRef: HTMLInputElement | undefined;

	const importer = useCSVImporter({
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

	const handleDrag = (e: {
		preventDefault: () => void;
		stopPropagation: () => void;
		type: string;
	}) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") {
			setDragActive(true);
		} else if (e.type === "dragleave") {
			setDragActive(false);
		}
	};

	const handleDrop = (e: {
		preventDefault: () => void;
		stopPropagation: () => void;
		type: string;
		dataTransfer: DataTransfer | null;
	}) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			importer.loadFile(e.dataTransfer.files[0]);
		}
	};

	const handleChange = (e: { currentTarget: HTMLInputElement }) => {
		const target = e.currentTarget as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			importer.loadFile(target.files[0]);
			target.value = "";
		}
	};

	const openPicker = (input?: HTMLInputElement) => {
		if (!input) return;
		input.value = "";
		input.click();
	};

	const hasData = () => Boolean(importer.state.mappedData && importer.state.mappedData.length > 0);
	const errorCount = () => importer.state.validation?.stats?.errorRows || 0;

	return (
		<div class="w-full font-sans h-[520px]">
			{!hasData() ? (
				<div
					class={`relative border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center h-full w-full ${dragActive() ? "border-black bg-neutral-100 scale-[0.99]" : "border-neutral-300 bg-white hover:border-black hover:bg-neutral-50"}`}
					onDragEnter={handleDrag}
					onDragLeave={handleDrag}
					onDragOver={handleDrag}
					onDrop={handleDrop}
				>
					<input
						ref={(el) => {
							uploadInputRef = el;
						}}
						type="file"
						accept=".csv"
						onChange={handleChange}
						class="hidden"
					/>

					{importer.isLoading() ? (
						<div class="text-black font-medium tracking-tight animate-pulse flex flex-col items-center">
							<svg
								class="w-8 h-8 mb-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								/>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Processing <strong>sample.csv</strong>...
						</div>
					) : (
						<>
							<div
								class={`p-4 rounded-full mb-4 transition-colors ${dragActive() ? "bg-black text-white" : "bg-neutral-100 text-black"}`}
							>
								<svg
									class="w-8 h-8"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
										d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
									/>
								</svg>
							</div>
							<h3 class="text-black font-semibold text-xl mb-2 mt-0 tracking-tight">
								Upload your CSV
							</h3>
							<p class="text-neutral-500 text-sm max-w-sm mx-auto mb-8 leading-relaxed">
								Drag and drop your file here or click the button below to browse your computer.
							</p>
							<button
								type="button"
								onClick={() => openPicker(uploadInputRef)}
								class="px-6 py-3 bg-black text-white text-sm font-semibold uppercase tracking-wider hover:bg-neutral-800 transition-colors"
							>
								Select File
							</button>
						</>
					)}
				</div>
			) : (
				<div class="border-2 border-black bg-white relative flex flex-col h-full w-full">
					<div class="absolute -top-3 left-6 bg-white px-2 text-sm font-bold uppercase tracking-widest text-black">
						Output Context
					</div>

					<div class="flex items-end justify-start p-6 pb-4 gap-4">
						<div class="flex gap-4 text-xs font-mono text-neutral-800 h-10">
							<span class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
								<strong class="text-black font-bold">Rows:</strong>{" "}
								{importer.state.mappedData?.length}
							</span>
							<span class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
								<strong class="text-black font-bold">Errors:</strong> {errorCount()}
							</span>
							{parsingTime() !== null && (
								<span class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
									<strong class="text-black font-bold">Time:</strong> {parsingTime()}ms
								</span>
							)}
						</div>

						<div class="h-10">
							<input
								ref={(el) => {
									reloadInputRef = el;
								}}
								type="file"
								accept=".csv"
								onChange={handleChange}
								class="hidden"
							/>
							<button
								onClick={() => openPicker(reloadInputRef)}
								type="button"
								class="h-full text-xs font-bold uppercase tracking-widest border-2 border-black px-4 hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
									/>
								</svg>
								Load New File
							</button>
						</div>
					</div>

					<div class="p-0 flex-1 border-t border-neutral-200 overflow-hidden">
						<pre class="m-0! p-6! bg-[#fafafa]! rounded-none! text-xs h-full w-full overflow-auto border-0!">
							<code>
								{JSON.stringify(
									{
										data: importer.state.mappedData
											?.slice(0, 3)
											.concat(importer.state.mappedData.length > 3 ? [["... (truncated)"]] : []),
										errors: importer.state.validation?.errors?.slice(0, 5),
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
