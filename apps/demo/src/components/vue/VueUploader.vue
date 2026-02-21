<script setup lang="ts">
import { useCSVImporter } from "@elekcsv/vue";
import { computed, ref } from "vue";

const dragActive = ref(false);
const parsingTime = ref<number | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

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
	onComplete: (result) => {
		parsingTime.value = result.stats.parseTime + result.stats.validationTime;
	},
});

const loadFile = importer.loadFile;
const isLoading = importer.isLoading;

function handleDrag(e: DragEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (e.type === "dragenter" || e.type === "dragover") {
		dragActive.value = true;
	} else if (e.type === "dragleave") {
		dragActive.value = false;
	}
}

function handleDrop(e: DragEvent) {
	e.preventDefault();
	e.stopPropagation();
	dragActive.value = false;

	if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
		loadFile(e.dataTransfer.files[0]);
	}
}

function handleChange(e: Event) {
	const target = e.target as HTMLInputElement;
	if (target.files && target.files.length > 0) {
		loadFile(target.files[0]);
		target.value = "";
	}
}

function handleButtonClick() {
	if (inputRef.value) {
		inputRef.value.value = "";
		inputRef.value.click();
	}
}

const hasData = computed(() => importer.state.mappedData && importer.state.mappedData.length > 0);
const errorCount = computed(() => importer.state.validation?.stats?.errorRows || 0);

const displayedData = computed(() => {
	if (!importer.state.mappedData) return [];
	const slice = importer.state.mappedData.slice(0, 3);
	return importer.state.mappedData.length > 3 ? slice.concat([["... (truncated)"]]) : slice;
});

const displayedErrors = computed(() => {
	return importer.state.validation?.errors?.slice(0, 5) || [];
});
</script>

<template>
  <div class="w-full font-sans h-[520px]">
    <input
      ref="inputRef"
      type="file"
      accept=".csv"
      @change="handleChange"
      class="hidden"
    />
    <div
      v-if="!hasData"
      :class="[
        'relative border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center h-full w-full',
        dragActive
          ? 'border-black bg-neutral-100 scale-[0.99]'
          : 'border-neutral-300 bg-white hover:border-black hover:bg-neutral-50',
      ]"
      @dragenter="handleDrag"
      @dragleave="handleDrag"
      @dragover="handleDrag"
      @drop="handleDrop"
      @click="handleButtonClick"
    >
      <div
        v-if="isLoading"
        class="text-black font-medium tracking-tight animate-pulse flex flex-col items-center"
      >
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

      <template v-else>
        <div
          :class="[
            'p-4 rounded-full mb-4 transition-colors',
            dragActive ? 'bg-black text-white' : 'bg-neutral-100 text-black',
          ]"
        >
          <svg
            class="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            ></path>
          </svg>
        </div>
        <h3 class="text-black font-semibold text-xl mb-2 mt-0 tracking-tight">
          Upload your CSV
        </h3>
        <p
          class="text-neutral-500 text-sm max-w-sm mx-auto mb-8 leading-relaxed"
        >
          Drag and drop your file here or click the button below to browse your
          computer.
        </p>
        <button
          type="button"
          class="px-6 py-3 bg-black text-white text-sm font-semibold uppercase tracking-wider hover:bg-neutral-800 transition-colors pointer-events-none"
        >
          Select File
        </button>
      </template>
    </div>

    <div
      v-else
      class="border-2 border-black bg-white relative flex flex-col h-full w-full"
    >
      <div
        class="absolute -top-3 left-6 bg-white px-2 text-sm font-bold uppercase tracking-widest text-black"
      >
        Output Context
      </div>

      <div class="flex items-end justify-start p-6 pb-4 gap-4">
        <div class="flex gap-4 text-xs font-mono text-neutral-800 h-10">
          <span
            class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap"
            ><strong class="text-black font-bold">Rows:</strong>
            {{ importer.state.mappedData?.length }}</span
          >
          <span
            class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap"
            ><strong class="text-black font-bold">Errors:</strong>
            {{ errorCount }}</span
          >
          <span
            v-if="parsingTime !== null"
            class="flex items-center gap-1.5 px-3 border border-neutral-300 whitespace-nowrap"
            ><strong class="text-black font-bold">Time:</strong>
            {{ parsingTime }}ms</span
          >
        </div>

        <div class="h-10">
          <button
            @click="handleButtonClick"
            type="button"
            class="h-full text-xs font-bold uppercase tracking-widest border-2 border-black px-4 hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
        <pre
          class="m-0! p-6! bg-[#fafafa]! rounded-none! text-xs h-full w-full overflow-auto border-0!"
        >
          <code>
{{ JSON.stringify({ data: displayedData, errors: displayedErrors }, null, 2) }}
          </code>
        </pre>
      </div>
    </div>
  </div>
</template>
