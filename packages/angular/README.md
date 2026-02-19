# @elekcsv/angular

Angular service with signals for headless CSV import with elek.

## Installation

```bash
npm install @elekcsv/angular
```

## Usage

```typescript
import { Component } from "@angular/core";
import { CSVImporterService } from "@elekcsv/angular";

@Component({
  selector: "app-csv-importer",
  template: `
    <p>Step: {{ importer.step() }}</p>
    <input type="file" (change)="onFileSelected($event)" />
  `,
})
export class CSVImporterComponent {
  importer = new CSVImporterService({
    schema: {
      columns: {
        name: { type: "string", rules: [{ rule: "required" }] },
        email: { type: "string", rules: [{ rule: "email" }] },
      },
    },
    onComplete: (result) => console.log(result.data),
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.importer.loadFile(input.files[0]);
    }
  }
}
```

See the [main README](https://github.com/k61b/elekcsv) for full documentation.

## License

Apache-2.0
