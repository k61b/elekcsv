<script lang="ts">
import { type ImportResult, createCSVImporter } from "@elekcsv/svelte";
import { onDestroy } from "svelte";

let dragActive = false;
let parsingTime: number | null = null;
const inputId = "svelte-uploader-input";

const importer = createCSVImporter({
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
		parsingTime = Math.round(result.stats.parseTime + result.stats.validationTime);
	},
});

const importerState = importer.store;

$: hasData = Boolean($importerState.mappedData?.length);
$: errorCount = $importerState.validation?.stats?.errorRows ?? 0;
$: previewJson = JSON.stringify(
	{
		data:
			$importerState.mappedData
				?.slice(0, 3)
				.concat($importerState.mappedData.length > 3 ? [["... (truncated)"]] : []) ?? [],
		errors: $importerState.validation?.errors?.slice(0, 5),
	},
	null,
	2
);

function handleChange(event: Event) {
	const target = event.target as HTMLInputElement;
	if (target.files && target.files.length > 0) {
		importer.loadFile(target.files[0]);
		target.value = "";
	}
}

function handleDrop(event: DragEvent) {
	event.preventDefault();
	dragActive = false;

	if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
		importer.loadFile(event.dataTransfer.files[0]);
	}
}

function openFilePicker() {
	const input = document.getElementById(inputId) as HTMLInputElement | null;
	if (input) {
		input.value = "";
		input.click();
	}
}

onDestroy(() => {
	importer.destroy();
});
</script>

<div class="w-full font-sans h-[520px]">
  {#if !hasData}
    <div
      class={`relative border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center h-full w-full ${dragActive ? 'border-black bg-neutral-100 scale-[0.99]' : 'border-neutral-300 bg-white hover:border-black hover:bg-neutral-50'}`}
      on:dragenter|preventDefault={() => (dragActive = true)}
      on:dragover|preventDefault={() => (dragActive = true)}
      on:dragleave|preventDefault={() => (dragActive = false)}
      on:drop={handleDrop}
      on:click={openFilePicker}
    >
      <input id={inputId} type="file" accept=".csv" on:change={handleChange} class="hidden" />

      {#if importer.isLoading}
        <div class="text-black font-medium tracking-tight animate-pulse flex flex-col items-center">
          <svg class="w-8 h-8 mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Processing <strong>sample.csv</strong>...
        </div>
      {:else}
        <div class="p-4 rounded-full mb-4 transition-colors bg-neutral-100 text-black">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            ></path>
          </svg>
        </div>
        <h3 class="text-black font-semibold text-xl mb-2 mt-0 tracking-tight">Upload your CSV</h3>
        <p class="text-neutral-500 text-sm max-w-sm mx-auto mb-8 leading-relaxed">
          Drag and drop your file here or click the button below to browse your computer.
        </p>
        <button
          type="button"
          class="px-6 py-3 bg-black text-white text-sm font-semibold uppercase tracking-wider hover:bg-neutral-800 transition-colors pointer-events-none"
        >
          Select File
        </button>
      {/if}
    </div>
  {:else}
    <div class="border-2 border-black bg-white relative flex flex-col h-full w-full">
      <div class="absolute -top-3 left-6 bg-white px-2 text-sm font-bold uppercase tracking-widest text-black">
        Output Context
      </div>

      <div class="flex items-end justify-start p-6 pb-4 gap-4">
        <div class="flex gap-4 text-xs font-mono text-neutral-800 h-10">
          <span class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
            <strong class="text-black font-bold">Rows:</strong>{$importerState.mappedData?.length}
          </span>
          <span class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
            <strong class="text-black font-bold">Errors:</strong>{errorCount}
          </span>
          {#if parsingTime !== null}
            <span class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap">
              <strong class="text-black font-bold">Time:</strong>{parsingTime}ms
            </span>
          {/if}
        </div>

        <div class="h-10">
          <input id={inputId} type="file" accept=".csv" on:change={handleChange} class="hidden" />
          <button
            on:click={openFilePicker}
            type="button"
            class="h-full text-xs font-bold uppercase tracking-widest border-2 border-black px-4 hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              ></path>
            </svg>
            Load New File
          </button>
        </div>
      </div>

      <div class="p-0 flex-1 border-t border-neutral-200 overflow-hidden">
        <pre class="m-0! p-6! bg-[#fafafa]! rounded-none! text-xs h-full w-full overflow-auto border-0!"><code>{previewJson}</code></pre>
      </div>
    </div>
  {/if}
</div>
