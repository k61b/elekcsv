# @elekcsv/vue

Vue composables for headless CSV import with elek.

## Installation

```bash
npm install @elekcsv/vue
```

## Usage

```vue
<script setup>
import { useCSVImporter } from "@elekcsv/vue";

const { state, step, isLoading, loadFile, confirmMapping, accept } = useCSVImporter({
  schema: {
    columns: {
      name: { type: "string", rules: [{ rule: "required" }] },
      email: { type: "string", rules: [{ rule: "email" }] },
    },
  },
  onComplete: (result) => console.log(result.data),
});
</script>

<template>
  <p>Step: {{ step }}</p>
  <input type="file" @change="e => e.target.files?.[0] && loadFile(e.target.files[0])" />
</template>
```

See the [main README](https://github.com/k61b/elekcsv) for full documentation.

## License

Apache-2.0
