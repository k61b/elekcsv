# @elekcsv/preact

Preact hooks for headless CSV import with elek.

## Installation

```bash
npm install @elekcsv/preact
```

## Usage

```tsx
import { useCSVImporter } from "@elekcsv/preact";

function CSVImporter() {
  const { step, loadFile, confirmMapping, accept } = useCSVImporter({
    schema: {
      columns: {
        name: { type: "string", rules: [{ rule: "required" }] },
        email: { type: "string", rules: [{ rule: "email" }] },
      },
    },
    onComplete: (result) => console.log(result.data),
  });

  return (
    <div>
      <p>Step: {step}</p>
      <input type="file" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
    </div>
  );
}
```

See the [main README](https://github.com/k61b/elekcsv) for full documentation.

## License

Apache-2.0
