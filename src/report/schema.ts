// Public JSON Schema URLs for the versioned report envelopes. Consumers can
// validate output offline or generate types from these.
const BASE =
	"https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas";

export function schemaUrl(file: string): string {
	return `${BASE}/${file}`;
}
