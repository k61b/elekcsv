# @elekcsv/svelte

Svelte stores for headless CSV import with elek.

## Installation

```bash
npm install @elekcsv/svelte
```

## Usage

```svelte
<script>
  import { createCSVImporter } from "@elekcsv/svelte";

  const importer = createCSVImporter({
    schema: {
      columns: {
        name: { type: "string", rules: [{ rule: "required" }] },
        email: { type: "string", rules: [{ rule: "email" }] },
      },
    },
    onComplete: (result) => console.log(result.data),
  });
</script>

<!-- Access state reactively via the store -->
<p>Step: {$importer.store.step}</p>

<!-- Or use the object API -->
<input 
  type="file" 
  on:change={(e) => e.target.files?.[0] && importer.loadFile(e.target.files[0])} 
/>
```

See the [main README](https://github.com/k61b/elekcsv) for full documentation.

## License

Apache-2.0
