# @elekcsv/react

React hooks for headless CSV import with elek.

## Installation

```bash
npm install @elekcsv/react
```

## Usage

```tsx
import { useCSVImporter } from "@elekcsv/react";

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

  // Build your own UI based on `step`
}
```

See the [main README](https://github.com/k61b/elekcsv) for full documentation.

## License

Apache-2.0
